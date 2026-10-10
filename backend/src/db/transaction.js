// withTransaction(fn): runs fn(trx) in one database transaction (LLD §1.1, §5).
// Passing an existing trx joins it, so a use case and the handlers it triggers share one
// transaction and commit or roll back together.

export function createWithTransaction(db) {
  return async function withTransaction(fn, { trx } = {}) {
    if (trx) return fn(trx);
    return db.transaction((t) => fn(t));
  };
}
