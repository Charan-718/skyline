import { err, matchesQ, nowIso, paginate, quoteTicket, uid } from '../domain';
import { audit, bookEvent, settlePayment } from '../ops';
import { clubOf, created, eventView, findOr404, hasRole, isOrganizer, isStaff, noContent, ok, paged, requireClubRole, requireUser, userName } from './shared';

const EDITABLE_BY_ORG = ['description', 'venue'];
const EVENT_FIELDS = ['title', 'description', 'venue', 'capacity', 'memberPricePaise', 'nonMemberPricePaise', 'memberDiscountEligible', 'earlyBirdMemberPricePaise', 'earlyBirdNonMemberPricePaise', 'earlyBirdQuantity', 'earlyBirdEndsAt', 'earlyAccessOpensAt', 'registrationOpensAt', 'registrationClosesAt', 'startsAt', 'endsAt'];

function validateEvent(ev) {
  const f = {};
  if (!ev.title || !String(ev.title).trim()) f.title = 'Enter a title.';
  if (!ev.venue || !String(ev.venue).trim()) f.venue = 'Enter a venue.';
  if (!Number.isInteger(ev.capacity) || ev.capacity < 1) f.capacity = 'Capacity must be at least 1.';
  if (!Number.isInteger(ev.memberPricePaise) || ev.memberPricePaise < 0) f.memberPricePaise = 'Enter a member price (0 for free).';
  if (ev.nonMemberPricePaise != null && (!Number.isInteger(ev.nonMemberPricePaise) || ev.nonMemberPricePaise < 0)) f.nonMemberPricePaise = 'Price must be zero or more.';
  ['registrationOpensAt', 'registrationClosesAt', 'startsAt', 'endsAt'].forEach((k) => {
    if (!ev[k]) f[k] = 'Required.';
  });
  if (!f.registrationOpensAt && !f.registrationClosesAt && ev.registrationOpensAt >= ev.registrationClosesAt) f.registrationClosesAt = 'Must be after registration opens.';
  if (!f.registrationClosesAt && !f.startsAt && ev.registrationClosesAt > ev.startsAt) f.registrationClosesAt = 'Registration must close before the event starts.';
  if (!f.startsAt && !f.endsAt && ev.startsAt >= ev.endsAt) f.endsAt = 'Must be after the start time.';
  if (ev.earlyAccessOpensAt && ev.earlyAccessOpensAt >= ev.registrationOpensAt) f.earlyAccessOpensAt = 'Early access must open before general registration.';
  const hasEb = ev.earlyBirdMemberPricePaise != null || ev.earlyBirdNonMemberPricePaise != null;
  if (hasEb && !ev.earlyBirdEndsAt) f.earlyBirdEndsAt = 'Set when early-bird pricing ends.';
  if (ev.earlyBirdEndsAt && (ev.earlyBirdEndsAt < ev.registrationOpensAt || ev.earlyBirdEndsAt > ev.registrationClosesAt)) f.earlyBirdEndsAt = 'Must fall within the registration window.';
  if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
}

function canManageEvent(db, userId, ev) {
  return hasRole(db, userId, ev.clubId, ['CLUB_HEAD']) || isOrganizer(db, userId, ev.id);
}

function visibleEvent(ctx) {
  const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
  if (['DRAFT', 'CANCELLED'].includes(ev.status) && !(ctx.user && canManageEvent(ctx.db, ctx.user.id, ev))) throw err(404, 'NOT_FOUND', 'Event not found.');
  return ev;
}

function eventReport(db, ev) {
  const tickets = db.tickets.filter((t) => t.eventId === ev.id && ['VALID', 'USED'].includes(t.status));
  const bookings = db.bookings.filter((b) => b.eventId === ev.id);
  const ledgerIn = db.ledger.filter((l) => l.eventId === ev.id && l.category === 'TICKET_SALE');
  const ledgerOut = db.ledger.filter((l) => l.eventId === ev.id && l.direction === 'OUT');
  const sum = (rows, k = 'amountPaise') => rows.reduce((s, r) => s + r[k], 0);
  const checkIns = db.checkIns.filter((c) => c.eventId === ev.id);
  const soldBookings = new Set(tickets.map((t) => t.bookingId));
  const payStatus = {};
  db.payments.filter((p) => bookings.some((b) => b.id === p.bookingId)).forEach((p) => {
    payStatus[p.status] = payStatus[p.status] || { status: p.status, count: 0, amountPaise: 0 };
    payStatus[p.status].count += 1;
    payStatus[p.status].amountPaise += p.amountPaise;
  });
  const series = {};
  ledgerIn.forEach((l) => {
    const d = l.occurredAt.slice(0, 10);
    series[d] = (series[d] || 0) + l.amountPaise;
  });
  const buckets = {};
  checkIns.forEach((c) => {
    const t = new Date(c.checkedInAt);
    t.setMinutes(Math.floor(t.getMinutes() / 15) * 15, 0, 0);
    const k = t.toISOString();
    buckets[k] = (buckets[k] || 0) + 1;
  });
  const gross = sum(ledgerIn);
  const expensesPaid = sum(ledgerOut);
  return {
    eventId: ev.id, title: ev.title, status: ev.status, capacity: ev.capacity,
    ticketsSold: tickets.length,
    pendingBookings: bookings.filter((b) => b.status === 'PENDING_PAYMENT').length,
    remainingCapacity: ev.capacity - ev.seatsReserved,
    memberVsNonMember: {
      MEMBER: bookings.filter((b) => soldBookings.has(b.id) && b.buyerType === 'MEMBER').length,
      NON_MEMBER: bookings.filter((b) => soldBookings.has(b.id) && b.buyerType === 'NON_MEMBER').length,
    },
    earlyBirdSold: bookings.filter((b) => soldBookings.has(b.id) && b.usesEarlyBird).length,
    grossRecordedRevenuePaise: gross, refundsPaise: 0, netRecordedRevenuePaise: gross,
    paymentStatusBreakdown: Object.values(payStatus),
    checkedIn: checkIns.length,
    attendanceRate: tickets.length ? checkIns.length / tickets.length : null,
    expensesPaidPaise: expensesPaid,
    expensesApprovedUnpaidPaise: sum(db.expenses.filter((e) => e.eventId === ev.id && e.status === 'APPROVED')),
    eventNetPaise: gross - expensesPaid,
    revenueSeries: Object.entries(series).sort().map(([date, amountPaise]) => ({ date, amountPaise })),
    checkInSeries: Object.entries(buckets).sort().map(([at, count]) => ({ at, count })),
  };
}

export const routes = [
  ['GET', '/events', ({ db, query }) => {
    const rows = db.events
      .filter((e) => (e.status === 'PUBLISHED' || (query.includePast === 'true' && e.status === 'COMPLETED')) && (!query.clubId || e.clubId === query.clubId) && matchesQ(query.q, e.title, e.venue))
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))
      .map((e) => eventView(db, e));
    return paged(paginate(rows, query));
  }],
  ['GET', '/clubs/:clubId/events', (ctx) => {
    const { db, params, query, user } = ctx;
    findOr404(db.clubs, params.clubId, 'Club');
    const head = user && hasRole(db, user.id, params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const rows = db.events.filter((e) => e.clubId === params.clubId && (query.all === 'true' && (head || (user && isOrganizer(db, user.id, e.id))) ? true : ['PUBLISHED', 'COMPLETED'].includes(e.status)));
    return ok(rows.sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)).map((e) => eventView(db, e)));
  }],
  ['GET', '/events/:eventId', (ctx) => {
    const ev = visibleEvent(ctx);
    const view = eventView(ctx.db, ev);
    if (ctx.user) {
      view.viewerCanManage = canManageEvent(ctx.db, ctx.user.id, ev);
      view.viewerIsClubHead = hasRole(ctx.db, ctx.user.id, ev.clubId, ['CLUB_HEAD']);
      view.viewerCanScan = view.viewerCanManage || isStaff(ctx.db, ctx.user.id, ev.id);
      const b = ctx.db.bookings.find((x) => x.eventId === ev.id && x.userId === ctx.user.id && ['PENDING_PAYMENT', 'CONFIRMED'].includes(x.status));
      if (b) {
        const ticket = ctx.db.tickets.find((t) => t.bookingId === b.id);
        const payment = ctx.db.payments.find((p) => p.bookingId === b.id);
        view.viewerBooking = { id: b.id, status: b.status, ticketId: ticket?.id, paymentId: payment?.id };
      }
    }
    return ok(view);
  }],
  ['GET', '/events/:eventId/price-quote', (ctx) => {
    const user = requireUser(ctx);
    return ok(quoteTicket(ctx.db, visibleEvent(ctx), user.id));
  }],
  ['POST', '/clubs/:clubId/events', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const ev = { id: uid('evt'), clubId: ctx.params.clubId, status: 'DRAFT', seatsReserved: 0, earlyBirdReserved: 0, memberDiscountEligible: true, nonMemberPricePaise: null, earlyBirdMemberPricePaise: null, earlyBirdNonMemberPricePaise: null, earlyBirdQuantity: null, earlyBirdEndsAt: null, earlyAccessOpensAt: null, createdAt: nowIso() };
    EVENT_FIELDS.forEach((k) => {
      if (ctx.body[k] !== undefined) ev[k] = ctx.body[k];
    });
    validateEvent(ev);
    ctx.db.events.push(ev);
    audit(ctx.db, actor.id, 'EVENT_CREATED', 'event', ev.id);
    return created(eventView(ctx.db, ev));
  }],
  ['PATCH', '/events/:eventId', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    const head = hasRole(db, user.id, ev.clubId, ['CLUB_HEAD']);
    if (!head && !isOrganizer(db, user.id, ev.id)) throw err(404, 'NOT_FOUND', 'Event not found.');
    if (['CANCELLED', 'COMPLETED'].includes(ev.status)) throw err(409, 'CONFLICT_STATE', 'This event can no longer be edited.', { currentStatus: ev.status });
    const changed = EVENT_FIELDS.filter((k) => body[k] !== undefined && body[k] !== ev[k]);
    if (!head && changed.some((k) => !EDITABLE_BY_ORG.includes(k))) throw err(403, 'FIELD_NOT_EDITABLE', 'Organizers can edit only the description and venue.');
    if (body.capacity !== undefined && body.capacity < ev.seatsReserved) throw err(422, 'CAPACITY_BELOW_RESERVED', `Capacity cannot be lower than the ${ev.seatsReserved} seats already sold or held.`, { fields: { capacity: `Minimum ${ev.seatsReserved}.` } });
    const next = { ...ev };
    changed.forEach((k) => {
      next[k] = body[k];
    });
    validateEvent(next);
    Object.assign(ev, next);
    audit(db, user.id, 'EVENT_UPDATED', 'event', ev.id, { fields: changed });
    return ok(eventView(db, ev));
  }],
  ['POST', '/events/:eventId/publish', (ctx) => {
    const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
    const actor = requireClubRole(ctx, ev.clubId, ['CLUB_HEAD']);
    if (ev.status !== 'DRAFT') throw err(409, 'CONFLICT_STATE', 'Only draft events can be published.', { currentStatus: ev.status });
    if (!ctx.db.organizers.some((o) => o.eventId === ev.id)) throw err(422, 'ORGANIZER_REQUIRED', 'Assign at least one organizer before publishing.');
    ev.status = 'PUBLISHED';
    audit(ctx.db, actor.id, 'EVENT_PUBLISHED', 'event', ev.id);
    return ok(eventView(ctx.db, ev));
  }],
  ['POST', '/events/:eventId/cancel', (ctx) => {
    const { db } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    const actor = requireClubRole(ctx, ev.clubId, ['CLUB_HEAD']);
    if (!['DRAFT', 'PUBLISHED'].includes(ev.status)) throw err(409, 'CONFLICT_STATE', 'This event cannot be cancelled.', { currentStatus: ev.status });
    if (!ctx.body.reason || !String(ctx.body.reason).trim()) throw err(400, 'VALIDATION_FAILED', 'Give a reason for cancelling.', { fields: { reason: 'Required.' } });
    let cancelledTickets = 0;
    let cancelledBookings = 0;
    db.bookings.filter((b) => b.eventId === ev.id).forEach((b) => {
      if (b.status === 'PENDING_PAYMENT') {
        const p = db.payments.find((x) => x.bookingId === b.id);
        if (p) settlePayment(db, p, 'FAILED', { reason: 'EVENT_CANCELLED' });
        cancelledBookings += 1;
      } else if (b.status === 'CONFIRMED') {
        b.status = 'CANCELLED';
        cancelledBookings += 1;
        db.tickets.filter((t) => t.bookingId === b.id && t.status === 'VALID').forEach((t) => {
          t.status = 'CANCELLED';
          cancelledTickets += 1;
        });
      }
    });
    ev.status = 'CANCELLED';
    ev.cancelReason = ctx.body.reason;
    audit(db, actor.id, 'EVENT_CANCELLED', 'event', ev.id, { reason: ctx.body.reason });
    return ok({ cancelledTickets, cancelledBookings, event: eventView(db, ev) });
  }],
  ['POST', '/events/:eventId/complete', (ctx) => {
    const user = requireUser(ctx);
    const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(ctx.db, user.id, ev)) throw err(404, 'NOT_FOUND', 'Event not found.');
    if (ev.status !== 'PUBLISHED') throw err(409, 'CONFLICT_STATE', 'Only published events can be completed.', { currentStatus: ev.status });
    if (nowIso() < ev.endsAt) throw err(422, 'EVENT_NOT_ENDED', 'You can mark the event completed after it ends.');
    ev.status = 'COMPLETED';
    return ok(eventView(ctx.db, ev));
  }],
  ['GET', '/events/:eventId/organizers', (ctx) => {
    const user = requireUser(ctx);
    const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(ctx.db, user.id, ev)) throw err(404, 'NOT_FOUND', 'Event not found.');
    return ok(ctx.db.organizers.filter((o) => o.eventId === ev.id).map((o) => ({ userId: o.userId, fullName: userName(ctx.db, o.userId), email: ctx.db.users.find((u) => u.id === o.userId)?.email })));
  }],
  ['PUT', '/events/:eventId/organizers', (ctx) => {
    const { db, body } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    const actor = requireClubRole(ctx, ev.clubId, ['CLUB_HEAD']);
    const ids = Array.isArray(body.userIds) ? body.userIds : [];
    if (ev.status === 'PUBLISHED' && !ids.length) throw err(422, 'ORGANIZER_REQUIRED', 'A published event needs at least one organizer.');
    if (ids.some((id) => !db.users.some((u) => u.id === id))) throw err(422, 'USER_NOT_FOUND', 'One of the selected users does not exist.');
    db.organizers = db.organizers.filter((o) => o.eventId !== ev.id).concat(ids.map((userId) => ({ eventId: ev.id, userId })));
    audit(db, actor.id, 'EVENT_ORGANIZERS_SET', 'event', ev.id, { userIds: ids });
    return ok(ids.map((userId) => ({ userId, fullName: userName(db, userId) })));
  }],
  ['GET', '/events/:eventId/staff', (ctx) => {
    const user = requireUser(ctx);
    const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(ctx.db, user.id, ev)) throw err(404, 'NOT_FOUND', 'Event not found.');
    // NOTE: `candidates` (club volunteers) is an addition to LLD §4.5 so organizers — who cannot read
    // /clubs/:id/roles — can pick staff. The backend should return the same field.
    return ok({
      staff: ctx.db.staff.filter((s) => s.eventId === ev.id).map((s) => ({ userId: s.userId, fullName: userName(ctx.db, s.userId), scans: ctx.db.checkIns.filter((c) => c.eventId === ev.id && c.checkedInBy === s.userId).length })),
      candidates: ctx.db.roles.filter((r) => r.clubId === ev.clubId && r.role === 'VOLUNTEER' && !r.revokedAt).map((r) => ({ userId: r.userId, fullName: userName(ctx.db, r.userId) })),
    });
  }],
  ['POST', '/events/:eventId/staff', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(db, user.id, ev)) throw err(404, 'NOT_FOUND', 'Event not found.');
    if (!hasRole(db, body.userId, ev.clubId, ['VOLUNTEER'])) throw err(422, 'NOT_CLUB_VOLUNTEER', 'Event staff must be volunteers of this club.');
    if (!db.staff.some((s) => s.eventId === ev.id && s.userId === body.userId)) db.staff.push({ eventId: ev.id, userId: body.userId });
    audit(db, user.id, 'EVENT_STAFF_ADDED', 'event', ev.id, { userId: body.userId });
    return created({ userId: body.userId, fullName: userName(db, body.userId) });
  }],
  ['DELETE', '/events/:eventId/staff/:userId', (ctx) => {
    const user = requireUser(ctx);
    const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(ctx.db, user.id, ev)) throw err(404, 'NOT_FOUND', 'Event not found.');
    ctx.db.staff = ctx.db.staff.filter((s) => !(s.eventId === ev.id && s.userId === ctx.params.userId));
    return noContent();
  }],
  ['POST', '/events/:eventId/bookings', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const ev = visibleEvent(ctx);
    const quote = quoteTicket(db, ev, user.id);
    if (!quote.eligible) {
      const messages = { MEMBERS_ONLY_EVENT: 'This event is for club members only.', REGISTRATION_NOT_OPEN: 'Registration has not opened yet.', REGISTRATION_CLOSED: 'Registration is closed.', SOLD_OUT: 'This event is sold out.' };
      throw err(quote.reason === 'SOLD_OUT' ? 409 : 422, quote.reason, messages[quote.reason]);
    }
    if (body.expectedFinalPricePaise !== quote.finalPricePaise) throw err(409, 'PRICE_CHANGED', 'The ticket price changed since you last looked. Please review and confirm.', { quote });
    const r = bookEvent(db, { userId: user.id, event: ev, quote });
    return created(r);
  }],
  ['POST', '/bookings/:bookingId/cancel', (ctx) => {
    const user = requireUser(ctx);
    const b = ctx.db.bookings.find((x) => x.id === ctx.params.bookingId && x.userId === user.id);
    if (!b) throw err(404, 'NOT_FOUND', 'Booking not found.');
    if (b.status !== 'PENDING_PAYMENT') throw err(409, 'CONFLICT_STATE', 'Only unpaid bookings can be cancelled.', { currentStatus: b.status });
    settlePayment(ctx.db, ctx.db.payments.find((p) => p.bookingId === b.id), 'FAILED', { reason: 'USER_CANCELLED' });
    return ok(b);
  }],
  ['GET', '/events/:eventId/bookings', (ctx) => {
    const user = requireUser(ctx);
    const { db, query } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(db, user.id, ev) && !hasRole(db, user.id, ev.clubId, ['TREASURER'])) throw err(404, 'NOT_FOUND', 'Event not found.');
    const rows = db.bookings
      .filter((b) => b.eventId === ev.id && (!query.status || b.status === query.status) && (!query.buyerType || b.buyerType === query.buyerType))
      .map((b) => {
        const u = db.users.find((x) => x.id === b.userId);
        const t = db.tickets.find((x) => x.bookingId === b.id);
        return { ...b, holderName: u?.fullName, holderEmail: u?.email, ticketStatus: t?.status || null, ticketCode: t?.ticketCode || null, checkedInAt: t?.usedAt || null };
      })
      .filter((r) => matchesQ(query.q, r.holderName, r.holderEmail, r.ticketCode))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return paged(paginate(rows, query));
  }],
  ['GET', '/me/tickets', (ctx) => {
    const user = requireUser(ctx);
    const { db } = ctx;
    const tickets = db.tickets.filter((t) => t.userId === user.id).map((t) => ({ ...t, qrToken: undefined, event: eventView(db, db.events.find((e) => e.id === t.eventId)), booking: db.bookings.find((b) => b.id === t.bookingId) }));
    const pending = db.bookings.filter((b) => b.userId === user.id && b.status === 'PENDING_PAYMENT').map((b) => ({ id: b.id, status: 'PENDING_PAYMENT', pending: true, paymentId: db.payments.find((p) => p.bookingId === b.id)?.id, holdExpiresAt: b.holdExpiresAt, event: eventView(db, db.events.find((e) => e.id === b.eventId)), booking: b }));
    return ok([...pending, ...tickets].sort((a, b) => (a.event.startsAt < b.event.startsAt ? 1 : -1)));
  }],
  ['GET', '/me/tickets/:ticketId', (ctx) => {
    const user = requireUser(ctx);
    const t = ctx.db.tickets.find((x) => x.id === ctx.params.ticketId && x.userId === user.id);
    if (!t) throw err(404, 'NOT_FOUND', 'Ticket not found.');
    const ev = ctx.db.events.find((e) => e.id === t.eventId);
    return ok({ id: t.id, ticketCode: t.ticketCode, status: t.status, usedAt: t.usedAt, event: eventView(ctx.db, ev), booking: ctx.db.bookings.find((b) => b.id === t.bookingId), holderName: user.fullName, qrPayload: t.status === 'VALID' ? `SOMS1:T:${t.qrToken}` : null });
  }],
  ['POST', '/events/:eventId/check-ins', (ctx) => {
    const user = requireUser(ctx);
    const { db } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(db, user.id, ev) && !isStaff(db, user.id, ev.id)) throw err(403, 'NOT_EVENT_STAFF', 'You are not assigned to scan tickets for this event.');
    if (ev.status !== 'PUBLISHED') throw err(422, 'EVENT_NOT_ACTIVE', 'Check-in is only open for published events.');
    const raw = String(ctx.body.qrPayload || '').trim();
    let ticket;
    if (raw.startsWith('SOMS1:T:')) ticket = db.tickets.find((t) => t.qrToken === raw.slice(8));
    else if (/^[0-9A-Z]{10}$/i.test(raw)) ticket = db.tickets.find((t) => t.ticketCode === raw.toUpperCase()); // manual code entry fallback
    else throw err(400, 'INVALID_QR_FORMAT', raw.startsWith('SOMS1:M:') ? 'This is a membership card, not a ticket.' : 'This is not a Campus Flow ticket.');
    if (!ticket) throw err(404, 'TICKET_NOT_FOUND', 'No ticket matches this code.');
    if (ticket.eventId !== ev.id) throw err(409, 'TICKET_WRONG_EVENT', `This ticket is for “${db.events.find((e) => e.id === ticket.eventId)?.title}”.`);
    if (ticket.status === 'CANCELLED') throw err(409, 'TICKET_CANCELLED', 'This ticket was cancelled.');
    const holderName = userName(db, ticket.userId);
    if (ticket.status === 'USED') throw err(409, 'TICKET_ALREADY_USED', 'This ticket has already been used.', { usedAt: ticket.usedAt, checkedInByName: userName(db, ticket.usedBy), holderName });
    ticket.status = 'USED';
    ticket.usedAt = nowIso();
    ticket.usedBy = user.id;
    db.checkIns.push({ id: uid('chk'), ticketId: ticket.id, eventId: ev.id, checkedInBy: user.id, checkedInAt: ticket.usedAt });
    audit(db, user.id, 'TICKET_CHECKED_IN', 'ticket', ticket.id);
    const booking = db.bookings.find((b) => b.id === ticket.bookingId);
    return created({ result: 'CHECKED_IN', ticketCode: ticket.ticketCode, holderName, buyerType: booking?.buyerType, checkedInAt: ticket.usedAt });
  }],
  ['GET', '/events/:eventId/check-ins', (ctx) => {
    const user = requireUser(ctx);
    const { db } = ctx;
    const ev = findOr404(db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(db, user.id, ev) && !isStaff(db, user.id, ev.id)) throw err(403, 'NOT_EVENT_STAFF', 'You are not assigned to this event.');
    const rows = db.checkIns.filter((c) => c.eventId === ev.id).sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1));
    return ok({
      checkedIn: rows.length,
      ticketsSold: db.tickets.filter((t) => t.eventId === ev.id && t.status !== 'CANCELLED').length,
      recent: rows.slice(0, 25).map((c) => {
        const t = db.tickets.find((x) => x.id === c.ticketId);
        return { ...c, ticketCode: t?.ticketCode, holderName: userName(db, t?.userId), checkedInByName: userName(db, c.checkedInBy) };
      }),
    });
  }],
  ['GET', '/events/:eventId/report', (ctx) => {
    const user = requireUser(ctx);
    const ev = findOr404(ctx.db.events, ctx.params.eventId, 'Event');
    if (!canManageEvent(ctx.db, user.id, ev) && !hasRole(ctx.db, user.id, ev.clubId, ['TREASURER'])) throw err(404, 'NOT_FOUND', 'Event not found.');
    return ok(eventReport(ctx.db, ev));
  }],
  ['GET', '/clubs/:clubId/reports/events', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    return ok(ctx.db.events.filter((e) => e.clubId === ctx.params.clubId && e.status !== 'DRAFT').map((e) => ({ ...eventReport(ctx.db, e), startsAt: e.startsAt, clubName: clubOf(ctx.db, e.clubId)?.name })));
  }],
];
