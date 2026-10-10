// Payment ↔ ledger reconciliation checks (a), (b), (d) from LLD §2.10, as plain SQL. Used after
// concurrency tests (TC-FIN-05 shape); the endpoint itself is T-83.

export async function reconcilePayments(db) {
  const { rows: byPurpose } = await db.raw(`
    WITH paid AS (
      SELECT purpose, sum(amount_paise) AS total FROM payments WHERE status = 'SUCCEEDED' GROUP BY purpose
    ), posted AS (
      SELECT p.purpose, sum(ft.amount_paise) AS total
        FROM financial_transactions ft JOIN payments p ON p.id = ft.payment_id
       WHERE ft.source_type = 'PAYMENT' AND ft.direction = 'IN'
       GROUP BY p.purpose
    )
    SELECT coalesce(paid.purpose, posted.purpose) AS purpose,
           coalesce(paid.total, 0) AS paid, coalesce(posted.total, 0) AS posted
      FROM paid FULL JOIN posted ON posted.purpose = paid.purpose`);
  const { rows: [{ n: succeededWithoutLedger }] } = await db.raw(`
    SELECT count(*)::int AS n FROM payments p
     WHERE p.status = 'SUCCEEDED'
       AND NOT EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.source_type = 'PAYMENT' AND ft.source_id = p.id)`);
  const { rows: [{ n: ledgerWithoutSucceeded }] } = await db.raw(`
    SELECT count(*)::int AS n FROM financial_transactions ft
      JOIN payments p ON p.id = ft.payment_id
     WHERE ft.source_type = 'PAYMENT' AND p.status <> 'SUCCEEDED'`);
  const mismatches = byPurpose.filter((r) => r.paid !== r.posted);
  return {
    ok: mismatches.length === 0 && succeededWithoutLedger === 0 && ledgerWithoutSucceeded === 0,
    mismatches,
    succeededWithoutLedger,
    ledgerWithoutSucceeded,
  };
}
