import { toCamelCase } from '../../shared/caseMap.js';

export function createNotificationRepository({ db }) {
  return {
    async enqueueMany(rows, trx) {
      if (rows.length === 0) return [];
      const inserted = await trx('notification_deliveries')
        .insert(rows)
        .onConflict('dedupe_key')
        .ignore()
        .returning('*');
      return inserted.map(toCamelCase);
    },

    async listPending(limit, trx = db) {
      const rows = await trx('notification_deliveries')
        .where({ status: 'PENDING' })
        .andWhere('next_attempt_at', '<=', trx.fn.now())
        .orderBy('next_attempt_at')
        .limit(limit)
        .forUpdate()
        .skipLocked();
      return rows.map(toCamelCase);
    },
  };
}
