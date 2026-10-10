// Stock counters, movements (append-only) and low-stock alerts (LLD §3.1, §3.2, §5.10).

export async function insertMovement(conn, row) {
  await conn('stock_movements').insert(row);
}

/** On-hand change that keeps stock_on_hand ≥ stock_reserved; null when it would not. */
export async function adjustOnHand(trx, variantId, delta) {
  const { rows } = await trx.raw(
    `UPDATE product_variants SET stock_on_hand = stock_on_hand + ?
      WHERE id = ? AND stock_on_hand + ? >= stock_reserved AND stock_on_hand + ? >= 0
      RETURNING *`,
    [delta, variantId, delta, delta],
  );
  return rows[0] ?? null;
}

/** Conditional reserve (LLD §3.2): only an active size of an ACTIVE product with enough available. */
export async function reserve(trx, variantId, clubId, quantity) {
  const { rows } = await trx.raw(
    `UPDATE product_variants v SET stock_reserved = v.stock_reserved + ?
       FROM products p
      WHERE v.id = ? AND v.club_id = ? AND p.id = v.product_id AND p.status = 'ACTIVE' AND v.is_active
        AND v.stock_on_hand - v.stock_reserved >= ?
      RETURNING v.*`,
    [quantity, variantId, clubId, quantity],
  );
  return rows[0] ?? null;
}

export async function release(trx, variantId, quantity) {
  const [v] = await trx('product_variants').where({ id: variantId }).update({ stock_reserved: trx.raw('stock_reserved - ?', [quantity]) }).returning('*');
  return v;
}

/** Payment success: the reservation becomes a sale (on hand and reserved both drop). */
export async function sell(trx, variantId, quantity) {
  const [v] = await trx('product_variants')
    .where({ id: variantId })
    .update({ stock_on_hand: trx.raw('stock_on_hand - ?', [quantity]), stock_reserved: trx.raw('stock_reserved - ?', [quantity]) })
    .returning('*');
  return v;
}

/** INSERT … ON CONFLICT on the partial unique "one OPEN alert per variant"; null if one is open. */
export async function openAlert(trx, { variantId, clubId, available, threshold, now }) {
  const { rows } = await trx.raw(
    `INSERT INTO low_stock_alerts (variant_id, club_id, status, available_at_trigger, threshold_at_trigger, triggered_at)
     VALUES (?, ?, 'OPEN', ?, ?, ?)
     ON CONFLICT (variant_id) WHERE status = 'OPEN' DO NOTHING
     RETURNING *`,
    [variantId, clubId, available, threshold, now],
  );
  return rows[0] ?? null;
}

export async function resolveAlert(trx, variantId, now) {
  return trx('low_stock_alerts').where({ variant_id: variantId, status: 'OPEN' }).update({ status: 'RESOLVED', resolved_at: now });
}

export function listAlerts(conn, clubId, { status }) {
  const q = conn('low_stock_alerts as a')
    .join('product_variants as v', 'v.id', 'a.variant_id')
    .join('products as p', 'p.id', 'v.product_id')
    .where('a.club_id', clubId)
    .select('a.*', 'v.size_label', 'v.product_id', 'p.name as product_name');
  if (status) q.where('a.status', status);
  return q.orderBy('a.triggered_at', 'desc');
}

export function inventory(conn, clubId) {
  return conn('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .leftJoin('low_stock_alerts as a', function joinOpen() {
      this.on('a.variant_id', 'v.id').andOnVal('a.status', 'OPEN');
    })
    .where('v.club_id', clubId)
    .select('v.*', 'p.name as product_name', 'p.status as product_status', 'a.id as alert_id', 'a.triggered_at as alert_triggered_at')
    .orderBy([{ column: 'p.name' }, { column: 'v.size_label' }]);
}
