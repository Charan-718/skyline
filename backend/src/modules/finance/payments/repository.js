// payments data access. Status changes are conditional updates only (LLD §2.10).

export async function insert(trx, row) {
  const [created] = await trx('payments').insert(row).returning('*');
  return created;
}

export async function findById(conn, id) {
  return conn('payments').where({ id }).first();
}

/**
 * The settle statement (LLD §2.10): only an open payment changes, so concurrent or repeated
 * settlement updates at most once. Returns the updated row, or null when nothing changed.
 */
export async function settleIfOpen(trx, id, { status, failureReason, settledAt }) {
  const result = await trx.raw(
    `UPDATE payments
        SET status = ?, failure_reason = ?, settled_at = ?
      WHERE id = ? AND status IN ('INITIATED', 'PENDING')
      RETURNING *`,
    [status, failureReason, settledAt, id],
  );
  return result.rows[0] ?? null;
}

/** INITIATED -> PENDING (no settlement, no side effects). Null when the payment was not INITIATED. */
export async function markPendingIfInitiated(trx, id) {
  const result = await trx.raw(
    `UPDATE payments SET status = 'PENDING' WHERE id = ? AND status = 'INITIATED' RETURNING *`,
    [id],
  );
  return result.rows[0] ?? null;
}

// from/to are calendar dates in `timeZone`, inclusive.
function applyFilters(query, { purpose, status, from, to, timeZone }) {
  if (purpose) query.where('purpose', purpose);
  if (status) query.where('status', status);
  if (from) query.whereRaw('created_at >= (?::date)::timestamp AT TIME ZONE ?', [from, timeZone]);
  if (to) query.whereRaw('created_at < ((?::date) + 1)::timestamp AT TIME ZONE ?', [to, timeZone]);
  return query;
}

async function page(conn, scope, filters, { limit, offset }) {
  const base = applyFilters(conn('payments').where(scope), filters);
  const [{ count }] = await base.clone().count({ count: '*' });
  const rows = await base.clone().orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(limit).offset(offset);
  return { rows, total: Number(count) };
}

export const listByUser = (conn, userId, filters, paging) => page(conn, { user_id: userId }, filters, paging);
export const listByClub = (conn, clubId, filters, paging) => page(conn, { club_id: clubId }, filters, paging);

/** Open payments whose hold has passed (reservation-expiry, OQ-09). */
export async function listExpirable(conn, { now, holdMinutes, autopayTimeoutHours, limit = 500 }) {
  const holdCutoff = new Date(now.getTime() - holdMinutes * 60_000);
  const autopayCutoff = new Date(now.getTime() - autopayTimeoutHours * 3_600_000);
  return conn('payments')
    .whereIn('status', ['INITIATED', 'PENDING'])
    .where((q) =>
      q
        .where((a) => a.where({ method: 'SIMULATED' }).where('created_at', '<=', holdCutoff))
        .orWhere((b) => b.where({ method: 'SIMULATED_AUTOPAY' }).where('created_at', '<=', autopayCutoff)),
    )
    .orderBy('created_at')
    .limit(limit);
}

export const findOpenByOrder = (conn, orderId) => conn('payments').where({ order_id: orderId }).whereIn('status', ['INITIATED', 'PENDING']).first();

export const listByOrder = (conn, orderId) => conn('payments').where({ order_id: orderId }).orderBy('created_at', 'asc');

/** Latest payment per order (for order lists). */
export async function latestByOrders(conn, orderIds) {
  if (!orderIds.length) return [];
  return conn('payments').distinctOn('order_id').whereIn('order_id', orderIds).orderBy([{ column: 'order_id' }, { column: 'created_at', order: 'desc' }]);
}
