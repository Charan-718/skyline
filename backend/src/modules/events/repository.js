import { toCamelCase } from '../../shared/caseMap.js';

export function createEventRepository({ db }) {
  return {
    db,

    async findById(id, trx = db) {
      const row = await trx('events').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async findForUpdate(id, trx) {
      const row = await trx('events').where({ id }).forUpdate().first();
      return row ? toCamelCase(row) : null;
    },

    async insert(row, trx) {
      const [e] = await trx('events').insert(row).returning('*');
      return toCamelCase(e);
    },

    async update(id, patch, trx) {
      const [e] = await trx('events').where({ id }).update(patch).returning('*');
      return e ? toCamelCase(e) : null;
    },

    async listPublished(filters, trx = db) {
      const statuses =
        filters.includePast === true || filters.includePast === 'true'
          ? ['PUBLISHED', 'COMPLETED']
          : ['PUBLISHED'];
      let q = trx('events as e')
        .leftJoin('clubs as c', 'c.id', 'e.club_id')
        .whereIn('e.status', statuses);
      if (filters.clubId) q = q.andWhere('e.club_id', filters.clubId);
      if (filters.q) {
        const like = `%${filters.q}%`;
        q = q.andWhere((b) => b.whereILike('e.title', like).orWhereILike('e.venue', like));
      }
      const countRow = await q.clone().count('* as c').first();
      const total = Number(countRow.c);
      const rows = await q
        .orderBy('e.starts_at')
        .offset(filters.offset ?? 0)
        .limit(filters.limit ?? 20)
        .select('e.*', 'c.name as club_name', 'c.slug as club_slug');
      return { rows: rows.map((r) => toCamelCase(r)), total };
    },

    async countTicketsForEvents(eventIds, trx = db) {
      if (!eventIds.length) return {};
      const rows = await trx('tickets')
        .whereIn('event_id', eventIds)
        .whereNot({ status: 'CANCELLED' })
        .groupBy('event_id')
        .select('event_id')
        .count('* as c');
      return Object.fromEntries(rows.map((r) => [r.event_id, Number(r.c)]));
    },

    async reserveSeat(eventId, usesEarlyBird, trx) {
      let q = trx('events')
        .where({ id: eventId, status: 'PUBLISHED' })
        .whereRaw('seats_reserved < capacity');
      if (usesEarlyBird) {
        q = q.whereRaw('(early_bird_quantity IS NULL OR early_bird_reserved < early_bird_quantity)');
      }
      const updated = await q.update({
        seats_reserved: trx.raw('seats_reserved + 1'),
        early_bird_reserved: usesEarlyBird ? trx.raw('early_bird_reserved + 1') : trx.raw('early_bird_reserved'),
        updated_at: trx.fn.now(),
      });
      if (!updated) return null;
      return this.findById(eventId, trx);
    },

    async releaseSeat(eventId, usesEarlyBird, trx) {
      await trx('events')
        .where({ id: eventId })
        .update({
          seats_reserved: trx.raw('GREATEST(seats_reserved - 1, 0)'),
          early_bird_reserved: usesEarlyBird
            ? trx.raw('GREATEST(early_bird_reserved - 1, 0)')
            : trx.raw('early_bird_reserved'),
        });
    },

    async insertBooking(row, trx) {
      const [b] = await trx('bookings').insert(row).returning('*');
      return toCamelCase(b);
    },

    async findBooking(id, trx = db) {
      const row = await trx('bookings').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async findLiveBooking(eventId, userId, trx = db) {
      const row = await trx('bookings')
        .where({ event_id: eventId, user_id: userId })
        .whereIn('status', ['PENDING_PAYMENT', 'CONFIRMED'])
        .first();
      return row ? toCamelCase(row) : null;
    },

    async insertTicket(row, trx) {
      const [t] = await trx('tickets').insert(row).returning('*');
      return toCamelCase(t);
    },

    async findTicketByQrToken(token, trx = db) {
      const row = await trx('tickets').where({ qr_token: token }).first();
      return row ? toCamelCase(row) : null;
    },

    async listTicketHolderUserIds(eventId, trx = db) {
      const rows = await trx('tickets')
        .where({ event_id: eventId })
        .whereIn('status', ['VALID', 'USED'])
        .select('user_id');
      return [...new Set(rows.map((r) => r.user_id))];
    },

    async listByClub(clubId, trx = db) {
      const rows = await trx('events as e')
        .leftJoin('clubs as c', 'c.id', 'e.club_id')
        .where('e.club_id', clubId)
        .orderBy('e.starts_at', 'desc')
        .select('e.*', 'c.name as club_name', 'c.slug as club_slug');
      return rows.map((r) => toCamelCase(r));
    },

    async listBookingsForEvent(eventId, filters, trx = db) {
      let q = trx('bookings as b')
        .join('users as u', 'u.id', 'b.user_id')
        .leftJoin('tickets as t', 't.booking_id', 'b.id')
        .where('b.event_id', eventId);
      if (filters.status) q = q.andWhere('b.status', filters.status);
      if (filters.buyerType) q = q.andWhere('b.buyer_type', filters.buyerType);
      if (filters.q) {
        const like = `%${filters.q}%`;
        q = q.andWhere((b) =>
          b
            .whereILike('u.full_name', like)
            .orWhereILike('u.email', like)
            .orWhereILike('t.ticket_code', like),
        );
      }
      const countRow = await q.clone().count('* as c').first();
      const total = Number(countRow.c);
      const rows = await q
        .orderBy('b.created_at', 'desc')
        .offset(filters.offset ?? 0)
        .limit(filters.limit ?? 20)
        .select(
          'b.*',
          'u.full_name as holder_name',
          'u.email as holder_email',
          't.status as ticket_status',
          't.ticket_code',
          't.used_at as checked_in_at',
        );
      return {
        rows: rows.map((r) => {
          const b = toCamelCase(r);
          return {
            ...b,
            holderName: r.holder_name,
            holderEmail: r.holder_email,
            ticketStatus: r.ticket_status,
            ticketCode: r.ticket_code,
            checkedInAt: r.checked_in_at,
          };
        }),
        total,
      };
    },

    async listTicketsForUser(userId, trx = db) {
      const rows = await trx('tickets').where({ user_id: userId }).orderBy('issued_at', 'desc');
      return rows.map(toCamelCase);
    },

    async findTicketByIdForUser(ticketId, userId, trx = db) {
      const row = await trx('tickets').where({ id: ticketId, user_id: userId }).first();
      return row ? toCamelCase(row) : null;
    },

    async listOrganizers(eventId, trx = db) {
      const rows = await trx('event_organizers as o')
        .join('users as u', 'u.id', 'o.user_id')
        .where('o.event_id', eventId)
        .select('o.user_id', 'u.full_name', 'u.email');
      return rows.map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        email: r.email,
      }));
    },

    async replaceOrganizers(eventId, userIds, assignedBy, trx) {
      await trx('event_organizers').where({ event_id: eventId }).del();
      if (!userIds.length) return [];
      const rows = userIds.map((userId) => ({
        event_id: eventId,
        user_id: userId,
        assigned_by: assignedBy,
      }));
      await trx('event_organizers').insert(rows);
      return this.listOrganizers(eventId, trx);
    },

    async listEventStaff(eventId, trx = db) {
      const rows = await trx('event_staff as s')
        .join('users as u', 'u.id', 's.user_id')
        .where('s.event_id', eventId)
        .select('s.user_id', 'u.full_name');
      const scans = await trx('check_ins')
        .where({ event_id: eventId })
        .groupBy('checked_in_by')
        .select('checked_in_by')
        .count('* as c');
      const scanMap = Object.fromEntries(scans.map((r) => [r.checked_in_by, Number(r.c)]));
      return rows.map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        scans: scanMap[r.user_id] ?? 0,
      }));
    },

    async listVolunteerCandidates(clubId, trx = db) {
      const rows = await trx('club_role_assignments as cra')
        .join('users as u', 'u.id', 'cra.user_id')
        .where({ 'cra.club_id': clubId, 'cra.role': 'VOLUNTEER' })
        .whereNull('cra.revoked_at')
        .select('cra.user_id', 'u.full_name');
      return rows.map((r) => ({ userId: r.user_id, fullName: r.full_name }));
    },

    async addEventStaff(eventId, clubId, userId, assignedBy, trx) {
      await trx('event_staff')
        .insert({ event_id: eventId, user_id: userId, club_id: clubId, assigned_by: assignedBy })
        .onConflict(['event_id', 'user_id'])
        .ignore();
    },

    async removeEventStaff(eventId, userId, trx) {
      await trx('event_staff').where({ event_id: eventId, user_id: userId }).del();
    },

    async listCheckIns(eventId, trx = db) {
      const checkedIn = await trx('check_ins').where({ event_id: eventId }).count('* as c').first();
      const ticketsSold = await trx('tickets')
        .where({ event_id: eventId })
        .whereNot({ status: 'CANCELLED' })
        .count('* as c')
        .first();
      const recent = await trx('check_ins as c')
        .join('tickets as t', 't.id', 'c.ticket_id')
        .join('users as hu', 'hu.id', 't.user_id')
        .join('users as cu', 'cu.id', 'c.checked_in_by')
        .where('c.event_id', eventId)
        .orderBy('c.id', 'desc')
        .limit(25)
        .select(
          'c.*',
          't.ticket_code',
          'hu.full_name as holder_name',
          'cu.full_name as checked_in_by_name',
        );
      return {
        checkedIn: Number(checkedIn.c),
        ticketsSold: Number(ticketsSold.c),
        recent: recent.map((r) => ({
          id: r.id,
          ticketId: r.ticket_id,
          eventId: r.event_id,
          checkedInBy: r.checked_in_by,
          checkedInAt: r.checked_in_at,
          ticketCode: r.ticket_code,
          holderName: r.holder_name,
          checkedInByName: r.checked_in_by_name,
        })),
      };
    },
  };
}
