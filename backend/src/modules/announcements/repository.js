import { toCamelCase } from '../../shared/caseMap.js';

export function createAnnouncementRepository({ db }) {
  return {
    db,

    async findById(id, trx = db) {
      const row = await trx('announcements').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async insert(row, trx) {
      const [a] = await trx('announcements').insert(row).returning('*');
      return toCamelCase(a);
    },

    async updateDraft(id, patch, trx) {
      const [a] = await trx('announcements')
        .where({ id, status: 'DRAFT' })
        .update({ ...patch, updated_at: trx.fn.now() })
        .returning('*');
      return a ? toCamelCase(a) : null;
    },

    async publish(id, publishedBy, trx) {
      const [a] = await trx('announcements')
        .where({ id, status: 'DRAFT' })
        .update({
          status: 'PUBLISHED',
          published_by: publishedBy,
          published_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning('*');
      return a ? toCamelCase(a) : null;
    },

    async listPublished(filters, trx = db) {
      let q = trx('announcements').where({ status: 'PUBLISHED' });
      if (filters.clubId) q = q.andWhere({ club_id: filters.clubId });
      if (filters.category) q = q.andWhere({ category: filters.category });
      const countRow = await q.clone().count('* as c').first();
      const total = Number(countRow.c);
      const rows = await q
        .orderBy('published_at', 'desc')
        .offset(filters.offset ?? 0)
        .limit(filters.limit ?? 20);
      return { rows: rows.map(toCamelCase), total };
    },
  };
}
