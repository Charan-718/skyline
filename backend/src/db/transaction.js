import { db } from './knex.js';

export async function withTransaction(fn) {
  return db.transaction(async (trx) => fn(trx));
}
