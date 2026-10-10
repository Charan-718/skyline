// Read-only finance aggregates (LLD §2.10, §5.15). Every query is scoped by club_id.
// from/to are IST calendar dates, inclusive; occurred_at is compared as instants.

function inPeriod(q, conn, { from, to, timeZone }) {
  if (from) q.whereRaw('occurred_at >= (?::date)::timestamp AT TIME ZONE ?', [from, timeZone]);
  if (to) q.whereRaw('occurred_at < ((?::date) + 1)::timestamp AT TIME ZONE ?', [to, timeZone]);
  return q;
}

export async function ledgerByCategory(conn, clubId, period) {
  const q = conn('financial_transactions').where({ club_id: clubId }).groupBy('direction', 'category').select('direction', 'category', conn.raw('sum(amount_paise)::bigint AS total'));
  return inPeriod(q, conn, period);
}

export async function allTimeTotals(conn, clubId) {
  const [row] = await conn('financial_transactions')
    .where({ club_id: clubId })
    .select(
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE direction = 'IN'), 0)::bigint AS total_in"),
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE direction = 'OUT'), 0)::bigint AS total_out"),
    );
  return row;
}

export async function expenseTotals(conn, clubId) {
  const [row] = await conn('expenses')
    .where({ club_id: clubId })
    .select(
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE status = 'APPROVED'), 0)::bigint AS approved_unpaid"),
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE status = 'SUBMITTED'), 0)::bigint AS pending_review"),
    );
  return row;
}

export async function monthly(conn, clubId, period) {
  const q = conn('financial_transactions')
    .where({ club_id: clubId })
    .select(
      conn.raw("to_char(date_trunc('month', occurred_at AT TIME ZONE ?), 'YYYY-MM') AS month", [period.timeZone]),
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE direction = 'IN'), 0)::bigint AS in_paise"),
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE direction = 'OUT'), 0)::bigint AS out_paise"),
    )
    .groupBy('month')
    .orderBy('month');
  return inPeriod(q, conn, period);
}

export async function listTransactions(conn, clubId, filters, { limit, offset }) {
  const base = conn('financial_transactions').where({ club_id: clubId });
  if (filters.direction) base.where({ direction: filters.direction });
  if (filters.category) base.where({ category: filters.category });
  if (filters.eventId) base.where({ event_id: filters.eventId });
  if (filters.fundraiserId) base.where({ fundraiser_id: filters.fundraiserId });
  inPeriod(base, conn, filters);
  const [{ count }] = await base.clone().count({ count: '*' });
  const rows = await base.clone().orderBy([{ column: 'occurred_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(limit).offset(offset);
  return { rows, total: count };
}

// ---- reconciliation (LLD §2.10 checks a–d) ---------------------------------------------

export async function paymentsVsLedgerByPurpose(conn, clubId) {
  const { rows } = await conn.raw(
    `WITH paid AS (
       SELECT purpose, sum(amount_paise)::bigint AS total FROM payments
        WHERE club_id = ? AND status = 'SUCCEEDED' GROUP BY purpose
     ), posted AS (
       SELECT category, sum(amount_paise)::bigint AS total FROM financial_transactions
        WHERE club_id = ? AND source_type = 'PAYMENT' AND direction = 'IN' GROUP BY category
     )
     SELECT p.purpose, coalesce(paid.total, 0)::bigint AS payments_paise, coalesce(posted.total, 0)::bigint AS ledger_paise
       FROM (VALUES ('MEMBERSHIP_JOIN', 'MEMBERSHIP_DUES'), ('MEMBERSHIP_RENEWAL', 'MEMBERSHIP_RENEWAL'),
                    ('EVENT_TICKET', 'TICKET_SALE'), ('MERCH_ORDER', 'MERCH_SALE')) AS p(purpose, category)
       LEFT JOIN paid ON paid.purpose = p.purpose
       LEFT JOIN posted ON posted.category = p.category
      ORDER BY p.purpose`,
    [clubId, clubId],
  );
  return rows;
}

export async function succeededPaymentsWithoutLedger(conn, clubId) {
  const { rows } = await conn.raw(
    `SELECT p.id FROM payments p
      WHERE p.club_id = ? AND p.status = 'SUCCEEDED'
        AND NOT EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.source_type = 'PAYMENT' AND ft.source_id = p.id)
      ORDER BY p.id`,
    [clubId],
  );
  return rows.map((r) => r.id);
}

export async function paidExpensesVsLedgerOut(conn, clubId) {
  const { rows } = await conn.raw(
    `SELECT (SELECT coalesce(sum(amount_paise), 0) FROM expenses WHERE club_id = ? AND status = 'PAID')::bigint AS expenses_paise,
            (SELECT coalesce(sum(amount_paise), 0) FROM financial_transactions WHERE club_id = ? AND direction = 'OUT')::bigint AS ledger_paise`,
    [clubId, clubId],
  );
  return rows[0];
}

export async function ledgerRowsWithUnsettledSource(conn, clubId) {
  const { rows } = await conn.raw(
    `SELECT ft.id, ft.source_type, ft.source_id FROM financial_transactions ft
       LEFT JOIN payments p ON ft.source_type = 'PAYMENT' AND p.id = ft.source_id
       LEFT JOIN expenses e ON ft.source_type = 'EXPENSE' AND e.id = ft.source_id
      WHERE ft.club_id = ?
        AND ((ft.source_type = 'PAYMENT' AND (p.id IS NULL OR p.status <> 'SUCCEEDED'))
          OR (ft.source_type = 'EXPENSE' AND (e.id IS NULL OR e.status <> 'PAID')))
      ORDER BY ft.id`,
    [clubId],
  );
  return rows;
}
