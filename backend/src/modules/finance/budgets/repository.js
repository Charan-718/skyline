// budgets data access + the budget aggregates (LLD §2.10).

export async function lockClubBudgets(trx, clubId) {
  // Serialises create/update per club so two overlapping budgets cannot both pass the check.
  await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`budgets:${clubId}`]);
}

export function findOverlap(conn, clubId, { periodStart, periodEnd }, excludeId) {
  const q = conn('budgets').where({ club_id: clubId }).where('period_start', '<=', periodEnd).where('period_end', '>=', periodStart);
  if (excludeId) q.whereNot({ id: excludeId });
  return q.first('id', 'name', 'period_start', 'period_end');
}

export async function insertBudget(conn, row) {
  const [created] = await conn('budgets').insert(row).returning('*');
  return created;
}

export async function updateBudget(conn, id, changes) {
  const [row] = await conn('budgets').where({ id }).update(changes).returning('*');
  return row;
}

export const findBudget = (conn, id) => conn('budgets').where({ id }).first();

export const listBudgets = (conn, clubId) => conn('budgets').where({ club_id: clubId }).orderBy('period_start', 'desc');

export const budgetCoveringDate = (conn, clubId, date) =>
  conn('budgets').where({ club_id: clubId }).where('period_start', '<=', date).where('period_end', '>=', date).first();

/** spent = Σ ledger OUT with occurred_at in [periodStart, periodEnd] (IST dates). */
export async function spentInPeriod(conn, clubId, { periodStart, periodEnd }, timeZone) {
  const { rows } = await conn.raw(
    `SELECT coalesce(sum(amount_paise), 0)::bigint AS total FROM financial_transactions
      WHERE club_id = ? AND direction = 'OUT'
        AND occurred_at >= (?::date)::timestamp AT TIME ZONE ?
        AND occurred_at < ((?::date) + 1)::timestamp AT TIME ZONE ?`,
    [clubId, periodStart, timeZone, periodEnd, timeZone],
  );
  return rows[0].total;
}

/** committed = Σ APPROVED expenses with incurred_on in [periodStart, periodEnd]. */
export async function committedInPeriod(conn, clubId, { periodStart, periodEnd }) {
  const [{ total }] = await conn('expenses')
    .where({ club_id: clubId, status: 'APPROVED' })
    .whereBetween('incurred_on', [periodStart, periodEnd])
    .select(conn.raw('coalesce(sum(amount_paise), 0)::bigint AS total'));
  return total;
}
