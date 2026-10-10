import { toCamelCase } from '../../../shared/caseMap.js';

export function createLedgerRepository({ db }) {
  return {
    async findBySource(sourceType, sourceId, trx = db) {
      const row = await trx('financial_transactions')
        .where({ source_type: sourceType, source_id: sourceId })
        .first();
      return row ? toCamelCase(row) : null;
    },

    async insert(entry, trx) {
      const [row] = await trx('financial_transactions').insert(entry).returning('*');
      return toCamelCase(row);
    },
  };
}
