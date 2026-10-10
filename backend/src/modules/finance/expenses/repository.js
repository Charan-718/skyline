// expenses data access. Transitions are conditional updates on the required status (LLD §5.11).

export async function insertExpense(conn, row) {
  const [created] = await conn('expenses').insert(row).returning('*');
  return created;
}

export const findExpense = (conn, id) => conn('expenses').where({ id }).first();

/** UPDATE … WHERE id = ? AND status = ? RETURNING * — null when the status had already moved. */
export async function transitionIfStatus(conn, id, fromStatus, changes) {
  const [row] = await conn('expenses').where({ id, status: fromStatus, kind: 'REIMBURSEMENT' }).update(changes).returning('*');
  return row ?? null;
}

function filtered(conn, where, { status, kind, eventId, fundraiserId }) {
  const q = conn('expenses').where(where);
  if (status) q.where({ status });
  if (kind) q.where({ kind });
  if (eventId) q.where({ event_id: eventId });
  if (fundraiserId) q.where({ fundraiser_id: fundraiserId });
  return q;
}

export async function listExpenses(conn, where, filters, { limit, offset }) {
  const base = filtered(conn, where, filters);
  const [{ count }] = await base.clone().count({ count: '*' });
  const rows = await base
    .clone()
    .orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }])
    .limit(limit)
    .offset(offset);
  return { rows, total: count };
}

export const findFilesByIds = (conn, ids) => (ids.length ? conn('uploaded_files').whereIn('id', ids) : Promise.resolve([]));
