// orders / order_items data access (LLD §3.1, §5.9). Status changes are conditional.

export async function insertOrder(trx, row) {
  const [o] = await trx('orders').insert(row).returning('*');
  return o;
}
export async function insertItems(trx, rows) {
  return trx('order_items').insert(rows).returning('*');
}
export const findOrder = (conn, id) => conn('orders').where({ id }).first();
export const itemsOf = (conn, orderIds) =>
  orderIds.length
    ? conn('order_items as i')
        .join('product_variants as v', 'v.id', 'i.variant_id')
        .join('products as p', 'p.id', 'i.product_id')
        .whereIn('i.order_id', orderIds)
        .select('i.*', 'v.size_label', 'p.name as product_name')
        .orderBy([{ column: 'i.order_id' }, { column: 'i.variant_id' }])
    : Promise.resolve([]);

/** UPDATE orders … WHERE id = ? AND status = ? RETURNING * (null when the status moved). */
export async function transition(trx, id, fromStatus, changes) {
  const [o] = await trx('orders').where({ id, status: fromStatus }).update(changes).returning('*');
  return o ?? null;
}

export const findByPickupCode = (conn, clubId, code) => conn('orders').where({ club_id: clubId, pickup_code: code }).first();

export async function listOrders(conn, where, { status, q }, { limit, offset }) {
  const base = conn('orders').where(where);
  if (status) base.where({ status });
  if (q) base.whereILike('pickup_code', `${q}%`);
  const [{ count }] = await base.clone().count({ count: '*' });
  const rows = await base.clone().orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(limit).offset(offset);
  return { rows, total: count };
}
