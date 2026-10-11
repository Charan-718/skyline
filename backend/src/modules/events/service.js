import { AppError, assertFound } from '../../shared/errors.js';
import { withTransaction } from '../../db/transaction.js';
import { config } from '../../config/index.js';
import { now } from '../../shared/clock.js';
import { buildTicketQrPayload, parseTicketQrPayload, renderQrSvg } from '../../shared/qr.js';
import { assertTransition } from './domain/eventStateMachine.js';
import { changedKeys, checkEventRules } from './domain/eventRules.js';
import { deriveSalesStatus } from './domain/salesWindow.js';
import { PRICE_TIERS } from '../pricing/PricingPolicy.js';
import { randomToken, ticketCode } from '../../shared/tokens.js';
import { parsePagination, paginatedResponse } from '../../shared/pagination.js';
import { presentEvent } from './eventPresenter.js';
import { changedFields, patchToSnake } from './eventHelpers.js';

export function createEventService({
  eventRepository,
  membershipService,
  pricingPolicy,
  paymentService,
  authz,
  config: appConfig,
}) {
  const holdMinutes = appConfig?.RESERVATION_HOLD_MINUTES ?? config.RESERVATION_HOLD_MINUTES;
  const db = eventRepository.db;

  async function canManageEvent(userId, event) {
    if (!userId) return false;
    return (
      (await authz.isClubHead(userId, event.clubId)) || (await authz.isOrganizer(userId, event.id))
    );
  }

  async function canViewEvent(userId, event) {
    if (!['DRAFT', 'CANCELLED'].includes(event.status)) return true;
    if (!userId) return false;
    return (await canManageEvent(userId, event)) || (await authz.isStaff(userId, event.id));
  }

  async function presentFullEvent(event) {
    const club = await db('clubs').where({ id: event.clubId }).first();
    const ticketsSold = await db('tickets')
      .where({ event_id: event.id })
      .whereNot({ status: 'CANCELLED' })
      .count('* as c')
      .first();
    const orgRows = await db('event_organizers as o')
      .join('users as u', 'u.id', 'o.user_id')
      .where('o.event_id', event.id)
      .select('o.user_id', 'u.full_name');
    return presentEvent(event, {
      clubName: club?.name ?? null,
      clubSlug: club?.slug ?? null,
      ticketsSold: Number(ticketsSold?.c ?? 0),
      organizers: orgRows.map((o) => ({ userId: o.user_id, fullName: o.full_name })),
      pricingPolicy,
    });
  }

  function assertRules(event, options) {
    const fields = checkEventRules(event, { now: now(), ...options });
    if (Object.keys(fields).length) {
      throw new AppError('VALIDATION_FAILED', 400, 'Please fix the highlighted fields.', { fields });
    }
  }

  async function requireManageOr404(userId, event) {
    if (!(await canManageEvent(userId, event))) {
      throw new AppError('NOT_FOUND', 404, 'Event not found');
    }
  }

  return {
    async listEvents(query) {
      const { page, pageSize, offset } = parsePagination(query, { page: 1, pageSize: 20, maxPageSize: 100 });
      const { rows, total } = await eventRepository.listPublished({
        clubId: query.clubId,
        q: query.q,
        includePast: query.includePast,
        offset,
        limit: pageSize,
      });
      const ticketCounts = await eventRepository.countTicketsForEvents(rows.map((r) => r.id));
      const data = rows.map((row) =>
        presentEvent(
          { ...row, clubId: row.clubId },
          {
            clubName: row.clubName ?? null,
            clubSlug: row.clubSlug ?? null,
            ticketsSold: ticketCounts[row.id] ?? 0,
            organizers: [],
            pricingPolicy,
          },
        ),
      );
      return paginatedResponse(data, page, pageSize, total);
    },

    async getEvent(eventId, viewerUserId = null) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      if (!(await canViewEvent(viewerUserId, event))) {
        throw new AppError('NOT_FOUND', 404, 'Event not found');
      }
      const view = await presentFullEvent(event);
      if (viewerUserId) {
        view.viewerCanManage = await canManageEvent(viewerUserId, event);
        view.viewerIsClubHead = await authz.isClubHead(viewerUserId, event.clubId);
        view.viewerCanScan =
          view.viewerCanManage ||
          (await authz.isStaff(viewerUserId, eventId)) ||
          (await authz.isOrganizer(viewerUserId, eventId));
        const booking = await eventRepository.findLiveBooking(eventId, viewerUserId);
        if (booking) {
          const ticket = await db('tickets').where({ booking_id: booking.id }).first();
          const payment = await db('payments').where({ booking_id: booking.id }).first();
          view.viewerBooking = {
            id: booking.id,
            status: booking.status,
            ticketId: ticket?.id ?? null,
            paymentId: payment?.id ?? null,
          };
        }
      }
      return view;
    },

    async listClubEvents(viewerUserId, clubId, query) {
      const rows = await eventRepository.listByClub(clubId);
      const all = query.all === 'true' || query.all === true;
      const head = viewerUserId ? await authz.isClubHead(viewerUserId, clubId) : false;
      const filtered = [];
      for (const e of rows) {
        const org = viewerUserId ? await authz.isOrganizer(viewerUserId, e.id) : false;
        if (all && (head || org)) filtered.push(e);
        else if (['PUBLISHED', 'COMPLETED'].includes(e.status)) filtered.push(e);
      }
      const ticketCounts = await eventRepository.countTicketsForEvents(filtered.map((r) => r.id));
      return filtered.map((row) =>
        presentEvent(row, {
          clubName: row.clubName ?? null,
          clubSlug: row.clubSlug ?? null,
          ticketsSold: ticketCounts[row.id] ?? 0,
          organizers: [],
          pricingPolicy,
        }),
      );
    },

    async quote(actor, eventId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      const benefits = actor?.userId
        ? await membershipService.getActiveBenefits(actor.userId, event.clubId)
        : null;
      const ebRemaining =
        event.earlyBirdQuantity == null
          ? null
          : event.earlyBirdQuantity - event.earlyBirdReserved;
      try {
        const quote = pricingPolicy.quoteTicket(event, benefits, ebRemaining);
        const salesStatus = deriveSalesStatus(
          event,
          benefits?.earlyBirdAccess,
          now(),
          pricingPolicy,
        );
        return {
          eligible: true,
          buyerType: benefits ? 'MEMBER' : 'NON_MEMBER',
          priceTier: quote.tier,
          listPricePaise: quote.list,
          discountPaise: quote.disc,
          finalPricePaise: quote.final,
          salesStatus,
          pricingMode: pricingPolicy.combinationMode,
          usesEarlyBird: quote.usesEarlyBird ?? false,
        };
      } catch (err) {
        if (err instanceof AppError) {
          return { eligible: false, reason: err.code, message: err.message };
        }
        throw err;
      }
    },

    async book(actor, eventId, expectedFinalPricePaise) {
      return withTransaction(async (trx) => {
        const existing = await eventRepository.findLiveBooking(eventId, actor.userId, trx);
        if (existing) throw new AppError('ALREADY_BOOKED', 409, 'Already booked');

        const event = await eventRepository.findForUpdate(eventId, trx);
        assertFound(event, 'Event not found');

        const benefits = await membershipService.getActiveBenefits(actor.userId, event.clubId);
        const ebRemaining =
          event.earlyBirdQuantity == null
            ? null
            : event.earlyBirdQuantity - event.earlyBirdReserved;

        let quote;
        try {
          quote = pricingPolicy.quoteTicket(event, benefits, ebRemaining);
        } catch (err) {
          throw err;
        }

        if (quote.final !== expectedFinalPricePaise) {
          throw new AppError('PRICE_CHANGED', 409, 'Price changed', {
            quote: {
              finalPricePaise: quote.final,
              priceTier: quote.tier,
            },
          });
        }

        const usesEarlyBird = quote.usesEarlyBird ?? false;
        const reserved = await eventRepository.reserveSeat(eventId, usesEarlyBird, trx);
        if (!reserved) {
          throw new AppError('SOLD_OUT', 409, 'Sold out');
        }

        const holdExpiresAt =
          quote.final > 0 ? new Date(now().getTime() + holdMinutes * 60 * 1000) : null;

        const booking = await eventRepository.insertBooking(
          {
            event_id: eventId,
            club_id: event.clubId,
            user_id: actor.userId,
            status: quote.final === 0 ? 'CONFIRMED' : 'PENDING_PAYMENT',
            buyer_type: benefits ? 'MEMBER' : 'NON_MEMBER',
            price_tier: quote.final === 0 ? PRICE_TIERS.FREE : quote.tier,
            list_price_paise: quote.list,
            discount_paise: quote.disc,
            final_price_paise: quote.final,
            pricing_mode: pricingPolicy.combinationMode,
            membership_term_id: benefits?.termId ?? null,
            uses_early_bird: usesEarlyBird,
            hold_expires_at: holdExpiresAt,
            confirmed_at: quote.final === 0 ? now() : null,
          },
          trx,
        );

        let payment = null;
        let ticket = null;

        if (quote.final === 0) {
          ticket = await eventRepository.insertTicket(
            {
              booking_id: booking.id,
              event_id: eventId,
              club_id: event.clubId,
              user_id: actor.userId,
              ticket_code: ticketCode(),
              qr_token: randomToken(16),
              status: 'VALID',
            },
            trx,
          );
        } else {
          payment = await paymentService.create(
            {
              clubId: event.clubId,
              userId: actor.userId,
              purpose: 'EVENT_TICKET',
              bookingId: booking.id,
              amountPaise: quote.final,
            },
            trx,
          );
        }

        return { booking, payment, ticket };
      });
    },

    async checkIn(actor, eventId, qrPayload) {
      const token = parseTicketQrPayload(qrPayload);
      if (!token) {
        throw new AppError('INVALID_QR_FORMAT', 400, 'Invalid ticket QR (membership cards use a different endpoint)');
      }

      const allowed =
        (await authz.isStaff(actor.userId, eventId)) ||
        (await authz.isOrganizer(actor.userId, eventId)) ||
        (await authz.eventClubId(eventId).then((cid) => authz.isClubHead(actor.userId, cid)));
      if (!allowed) throw new AppError('NOT_EVENT_STAFF', 403, 'Not event staff');

      const event = await eventRepository.findById(eventId);
      if (event.status !== 'PUBLISHED') {
        throw new AppError('EVENT_NOT_ACTIVE', 422, 'Event not active');
      }

      return withTransaction(async (trx) => {
        const [updated] = await trx('tickets')
          .where({ qr_token: token, event_id: eventId, status: 'VALID' })
          .update({ status: 'USED', used_at: now(), used_by: actor.userId })
          .returning('*');

        if (updated) {
          await trx('check_ins').insert({
            ticket_id: updated.id,
            event_id: eventId,
            checked_in_by: actor.userId,
          });
          const user = await trx('users').where({ id: updated.user_id }).first();
          return {
            result: 'CHECKED_IN',
            ticketCode: updated.ticket_code,
            holderName: user.full_name,
            buyerType: (await trx('bookings').where({ id: updated.booking_id }).first()).buyer_type,
            checkedInAt: updated.used_at,
          };
        }

        const ticket = await eventRepository.findTicketByQrToken(token, trx);
        if (!ticket) throw new AppError('TICKET_NOT_FOUND', 404, 'Ticket not found');
        if (ticket.eventId !== eventId) throw new AppError('TICKET_WRONG_EVENT', 409, 'Wrong event');
        if (ticket.status === 'USED') {
          throw new AppError('TICKET_ALREADY_USED', 409, 'Ticket already used', {
            usedAt: ticket.usedAt,
          });
        }
        if (ticket.status === 'CANCELLED') throw new AppError('TICKET_CANCELLED', 409, 'Ticket cancelled');
        throw new AppError('TICKET_NOT_FOUND', 404, 'Ticket not found');
      });
    },

    async createEvent(actor, clubId, dto) {
      await authz.requireClubHead(actor.userId, clubId);
      assertRules(dto, { mode: 'create' });
      return eventRepository.insert(
        {
          club_id: clubId,
          title: dto.title,
          description: dto.description ?? '',
          venue: dto.venue,
          starts_at: dto.startsAt,
          ends_at: dto.endsAt,
          registration_opens_at: dto.registrationOpensAt,
          registration_closes_at: dto.registrationClosesAt,
          early_access_opens_at: dto.earlyAccessOpensAt ?? null,
          capacity: dto.capacity,
          member_price_paise: dto.memberPricePaise,
          non_member_price_paise: dto.nonMemberPricePaise ?? null,
          member_discount_eligible: dto.memberDiscountEligible ?? true,
          early_bird_member_price_paise: dto.earlyBirdMemberPricePaise ?? null,
          early_bird_non_member_price_paise: dto.earlyBirdNonMemberPricePaise ?? null,
          early_bird_ends_at: dto.earlyBirdEndsAt ?? null,
          early_bird_quantity: dto.earlyBirdQuantity ?? null,
          status: 'DRAFT',
          created_by: actor.userId,
        },
        eventRepository.db,
      );
    },

    async publish(actor, eventId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await authz.requireClubHead(actor.userId, event.clubId);
      const orgs = await db('event_organizers').where({ event_id: eventId });
      if (orgs.length === 0) throw new AppError('ORGANIZER_REQUIRED', 422, 'Organizer required');
      assertTransition(event.status, 'publish');
      assertRules(event, { mode: 'publish' });
      const updated = await eventRepository.update(
        eventId,
        { status: 'PUBLISHED', published_at: now() },
        db,
      );
      return presentFullEvent(updated);
    },

    async updateEvent(actor, eventId, body) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await requireManageOr404(actor.userId, event);
      if (['CANCELLED', 'COMPLETED'].includes(event.status)) {
        throw new AppError('CONFLICT_STATE', 409, 'Event cannot be edited', { currentStatus: event.status });
      }
      const changed = changedFields(event, body);
      const head = await authz.isClubHead(actor.userId, event.clubId);
      if (!head && changed.some((k) => !['description', 'venue'].includes(k))) {
        throw new AppError('FIELD_NOT_EDITABLE', 403, 'Organizers may edit description and venue only');
      }
      if (body.capacity !== undefined && body.capacity < event.seatsReserved) {
        throw new AppError('CAPACITY_BELOW_RESERVED', 422, 'Capacity below reserved seats', {
          fields: { capacity: `Minimum ${event.seatsReserved}.` },
        });
      }
      assertRules(
        { ...event, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) },
        {
          mode: 'update',
          changed: changedKeys(event, body),
          seatsReserved: event.seatsReserved ?? 0,
          earlyBirdReserved: event.earlyBirdReserved ?? 0,
        },
      );
      const patch = patchToSnake(body);
      const updated = await eventRepository.update(eventId, patch, db);
      return presentFullEvent(updated);
    },

    async cancelEvent(actor, eventId, reason) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await authz.requireClubHead(actor.userId, event.clubId);
      if (!reason?.trim()) {
        throw new AppError('VALIDATION_FAILED', 400, 'Cancellation reason required', {
          fields: { reason: 'Required.' },
        });
      }
      assertTransition(event.status, 'cancel');
      let cancelledTickets = 0;
      let cancelledBookings = 0;
      await withTransaction(async (trx) => {
        const bookings = await trx('bookings').where({ event_id: eventId });
        for (const b of bookings) {
          if (b.status === 'PENDING_PAYMENT') {
            const pay = await trx('payments')
              .where({ booking_id: b.id })
              .whereIn('status', ['INITIATED', 'PENDING'])
              .first();
            if (pay) {
              await paymentService.settle(pay.id, 'FAILED', trx, { failureReason: 'EVENT_CANCELLED' });
            }
            cancelledBookings += 1;
          } else if (b.status === 'CONFIRMED') {
            await trx('bookings').where({ id: b.id }).update({ status: 'CANCELLED', cancelled_at: now() });
            const tk = await trx('tickets')
              .where({ booking_id: b.id, status: 'VALID' })
              .update({ status: 'CANCELLED', cancelled_at: now() });
            cancelledTickets += tk;
            cancelledBookings += 1;
            await eventRepository.releaseSeat(eventId, b.uses_early_bird, trx);
          }
        }
        await eventRepository.update(
          eventId,
          { status: 'CANCELLED', cancel_reason: reason.trim(), cancelled_at: now() },
          trx,
        );
      });
      const updated = await eventRepository.findById(eventId);
      return { cancelledTickets, cancelledBookings, event: await presentFullEvent(updated) };
    },

    async completeEvent(actor, eventId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await requireManageOr404(actor.userId, event);
      assertTransition(event.status, 'complete');
      if (new Date(event.endsAt) > now()) {
        throw new AppError('EVENT_NOT_ENDED', 422, 'Event has not ended yet');
      }
      const updated = await eventRepository.update(eventId, { status: 'COMPLETED', completed_at: now() }, db);
      return presentFullEvent(updated);
    },

    async listOrganizers(actor, eventId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await requireManageOr404(actor.userId, event);
      return eventRepository.listOrganizers(eventId);
    },

    async setOrganizers(actor, eventId, userIds) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await authz.requireClubHead(actor.userId, event.clubId);
      const ids = [...new Set(userIds ?? [])];
      if (event.status === 'PUBLISHED' && ids.length === 0) {
        throw new AppError('ORGANIZER_REQUIRED', 422, 'Organizer required');
      }
      for (const id of ids) {
        const u = await db('users').where({ id }).first();
        if (!u) throw new AppError('USER_NOT_FOUND', 422, 'User not found');
      }
      return eventRepository.replaceOrganizers(eventId, ids, actor.userId, db);
    },

    async listStaff(actor, eventId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await requireManageOr404(actor.userId, event);
      const staff = await eventRepository.listEventStaff(eventId);
      const candidates = await eventRepository.listVolunteerCandidates(event.clubId);
      return { staff, candidates };
    },

    async addStaff(actor, eventId, userId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await requireManageOr404(actor.userId, event);
      if (!(await authz.isVolunteer(userId, event.clubId))) {
        throw new AppError('NOT_CLUB_VOLUNTEER', 422, 'User must be a club volunteer');
      }
      await eventRepository.addEventStaff(eventId, event.clubId, userId, actor.userId, db);
      const u = await db('users').where({ id: userId }).first();
      return { userId, fullName: u.full_name };
    },

    async removeStaff(actor, eventId, userId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      await requireManageOr404(actor.userId, event);
      await eventRepository.removeEventStaff(eventId, userId, db);
    },

    async listBookings(actor, eventId, query) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      const allowed =
        (await canManageEvent(actor.userId, event)) ||
        (await authz.isTreasurer(actor.userId, event.clubId));
      if (!allowed) throw new AppError('NOT_FOUND', 404, 'Event not found');
      const { page, pageSize, offset } = parsePagination(query, { page: 1, pageSize: 20, maxPageSize: 100 });
      const { rows, total } = await eventRepository.listBookingsForEvent(eventId, {
        status: query.status,
        buyerType: query.buyerType,
        q: query.q,
        offset,
        limit: pageSize,
      });
      return paginatedResponse(rows, page, pageSize, total);
    },

    async listMyTickets(userId) {
      const tickets = await eventRepository.listTicketsForUser(userId);
      const pending = await db('bookings')
        .where({ user_id: userId, status: 'PENDING_PAYMENT' })
        .orderBy('created_at', 'desc');
      const items = [];
      for (const b of pending) {
        const ev = await eventRepository.findById(b.event_id);
        if (!ev) continue;
        const payment = await db('payments').where({ booking_id: b.id }).first();
        items.push({
          id: b.id,
          status: 'PENDING_PAYMENT',
          pending: true,
          paymentId: payment?.id ?? null,
          holdExpiresAt: b.hold_expires_at,
          event: await presentFullEvent(await eventRepository.findById(b.event_id)),
          booking: await eventRepository.findBooking(b.id),
        });
      }
      for (const t of tickets) {
        const ev = await eventRepository.findById(t.eventId);
        const booking = await eventRepository.findBooking(t.bookingId);
        items.push({
          ...t,
          qrToken: undefined,
          event: ev ? await presentFullEvent(ev) : null,
          booking,
        });
      }
      items.sort((a, b) => {
        const aStart = a.event?.startsAt ?? '';
        const bStart = b.event?.startsAt ?? '';
        return aStart < bStart ? 1 : -1;
      });
      return items;
    },

    async getMyTicket(userId, ticketId) {
      const t = await eventRepository.findTicketByIdForUser(ticketId, userId);
      assertFound(t, 'Ticket not found');
      const ev = await eventRepository.findById(t.eventId);
      const booking = await eventRepository.findBooking(t.bookingId);
      const user = await db('users').where({ id: userId }).first();
      return {
        id: t.id,
        ticketCode: t.ticketCode,
        status: t.status,
        usedAt: t.usedAt,
        event: ev ? await presentFullEvent(ev) : null,
        booking,
        holderName: user?.full_name,
        qrPayload: t.status === 'VALID' ? buildTicketQrPayload(t.qrToken) : null,
      };
    },

    async listCheckIns(actor, eventId) {
      const event = await eventRepository.findById(eventId);
      assertFound(event, 'Event not found');
      const allowed =
        (await canManageEvent(actor.userId, event)) || (await authz.isStaff(actor.userId, eventId));
      if (!allowed) throw new AppError('NOT_EVENT_STAFF', 403, 'Not event staff');
      return eventRepository.listCheckIns(eventId);
    },
  };
}
