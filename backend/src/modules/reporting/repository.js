// Read-only report queries (LLD §1.2: reporting reads any table, writes none). Club-scoped.
// from/to are IST calendar dates, inclusive.

function inPeriod(q, { from, to, timeZone }) {
  if (from) q.whereRaw('occurred_at >= (?::date)::timestamp AT TIME ZONE ?', [from, timeZone]);
  if (to) q.whereRaw('occurred_at < ((?::date) + 1)::timestamp AT TIME ZONE ?', [to, timeZone]);
  return q;
}

/** Σ amount and row count per (direction, category) of the club's ledger in the period. */
export function ledgerCategoryBreakdown(conn, clubId, period) {
  const q = conn('financial_transactions')
    .where({ club_id: clubId })
    .groupBy('direction', 'category')
    .select('direction', 'category', conn.raw('sum(amount_paise)::bigint AS total'), conn.raw('count(*)::int AS entries'));
  return inPeriod(q, period);
}
