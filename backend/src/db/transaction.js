import { db } from './knex.js';

export async function withTransaction(fn) {
  return db.transaction(async (trx) => fn(trx));
}

/** Group 2 composition: `(fn) => db.transaction(fn)`. */
export function createWithTransaction(conn) {
  return (fn) => conn.transaction(fn);
}
