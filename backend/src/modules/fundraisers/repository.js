// fundraisers / fundraiser_tasks data access. Status changes are conditional on the status the
// service planned from (WHERE status = ?), so a concurrent change surfaces as CONFLICT_STATE.

export async function insertFundraiser(conn, row) {
  const [created] = await conn('fundraisers').insert(row).returning('*');
  return created;
}

export const findFundraiser = (conn, id) => conn('fundraisers').where({ id }).first();

export async function updateFundraiserIfStatus(conn, id, expectedStatus, changes) {
  const [row] = await conn('fundraisers').where({ id, status: expectedStatus }).update(changes).returning('*');
  return row ?? null;
}

export function listFundraisers(conn, clubId, { status }) {
  const q = conn('fundraisers').where({ club_id: clubId });
  if (status) q.where({ status });
  return q.orderBy([{ column: 'target_date', order: 'asc' }, { column: 'created_at', order: 'asc' }]);
}

export async function insertTask(conn, row) {
  const [created] = await conn('fundraiser_tasks').insert(row).returning('*');
  return created;
}

export const findTask = (conn, id) => conn('fundraiser_tasks').where({ id }).first();

export async function updateTaskIfStatus(conn, id, expectedStatus, changes) {
  const [row] = await conn('fundraiser_tasks').where({ id, status: expectedStatus }).update(changes).returning('*');
  return row ?? null;
}

export function listTasksOfFundraisers(conn, fundraiserIds) {
  if (!fundraiserIds.length) return Promise.resolve([]);
  return conn('fundraiser_tasks')
    .whereIn('fundraiser_id', fundraiserIds)
    .orderBy([{ column: 'deadline', order: 'asc' }, { column: 'id', order: 'asc' }]);
}

export function listTasksOfAssignee(conn, userId, { status }) {
  const q = conn('fundraiser_tasks as t')
    .join('fundraisers as f', 'f.id', 't.fundraiser_id')
    .where('t.assignee_user_id', userId)
    .select('t.*', 'f.name as fundraiser_name', 'f.status as fundraiser_status');
  if (status) q.where('t.status', status);
  return q.orderBy([{ column: 't.deadline', order: 'asc' }, { column: 't.id', order: 'asc' }]);
}
