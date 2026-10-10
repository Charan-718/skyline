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
      let q = trx('events').where({ status: 'PUBLISHED' }).orderBy('starts_at');
      if (filters.clubId) q = q.andWhere({ club_id: filters.clubId });
      const rows = await q.limit(filters.limit ?? 50);
      return rows.map(toCamelCase);
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

    async findLiveBooking(eventId, userId, trx) {
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
  };
}
