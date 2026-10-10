import { toOffset } from '../../../shared/pagination.js';
import { summarize } from '../domain/formulas.js';
import * as repository from './repository.js';

// Finance summary, transactions and reconciliation (LLD §2.10, §4.9; T-83).

export function createFinanceSummaryService({ db, clock, budgets, auth, timeZone }) {
  async function summary(clubId, { from, to }) {
    const period = { from, to, timeZone };
    const [byCategory, allTime, expenses, months, activeBudget] = await Promise.all([
      repository.ledgerByCategory(db, clubId, period),
      repository.allTimeTotals(db, clubId),
      repository.expenseTotals(db, clubId),
      repository.monthly(db, clubId, period),
      budgets.activeOn(clubId, clock.todayIST()),
    ]);
    const periodByCategory = { IN: {}, OUT: {} };
    for (const r of byCategory) {
      periodByCategory[r.direction][r.category] = Number(r.total) || 0;
    }
    return {
      currency: 'INR',
      period: { from: from ?? null, to: to ?? null },
      ...summarize({
        periodByCategory,
        allTimeIn: allTime.total_in,
        allTimeOut: allTime.total_out,
        approvedUnpaid: expenses.approved_unpaid,
        pendingReview: expenses.pending_review,
      }),
      activeBudget: activeBudget ? { id: activeBudget.budget.id, name: activeBudget.budget.name, ...activeBudget.figures } : null,
      monthly: months.map((m) => ({
        month: m.month,
        inPaise: Number(m.in_paise) || 0,
        outPaise: Number(m.out_paise) || 0,
      })),
    };
  }

  async function transactions(clubId, query) {
    const { rows, total } = await repository.listTransactions(db, clubId, { ...query, timeZone }, { limit: query.pageSize, offset: toOffset(query) });
    const ids = [...new Set(rows.flatMap((r) => [r.recorded_by, r.approved_by, r.payer_user_id]).filter(Boolean))];
    const users = ids.length ? await auth.getUsersByIds(ids) : [];
    return { rows, total, names: new Map(users.map((u) => [u.id, u.fullName])) };
  }

  /**
   * Checks (a)–(d) of LLD §2.10. `conn` lets a test run it inside its own transaction.
   *   a  Σ SUCCEEDED payments by purpose = Σ ledger IN of the matching category (source PAYMENT)
   *   b  SUCCEEDED payments without a ledger row = 0
   *   c  Σ PAID expenses = Σ ledger OUT
   *   d  ledger rows whose source is not SUCCEEDED / PAID = 0 (INCOME_ENTRY rows: n/a, OQ-15)
   */
  async function reconcile(clubId, { conn = db } = {}) {
    const [byPurpose, missing, out, orphans] = await Promise.all([
      repository.paymentsVsLedgerByPurpose(conn, clubId),
      repository.succeededPaymentsWithoutLedger(conn, clubId),
      repository.paidExpensesVsLedgerOut(conn, clubId),
      repository.ledgerRowsWithUnsettledSource(conn, clubId),
    ]);
    const mismatches = [];
    for (const r of byPurpose) {
      if (r.payments_paise !== r.ledger_paise) mismatches.push({ check: 'a', purpose: r.purpose, paymentsPaise: r.payments_paise, ledgerPaise: r.ledger_paise });
    }
    for (const id of missing) mismatches.push({ check: 'b', paymentId: id });
    if (out.expenses_paise !== out.ledger_paise) mismatches.push({ check: 'c', paidExpensesPaise: out.expenses_paise, ledgerOutPaise: out.ledger_paise });
    for (const o of orphans) mismatches.push({ check: 'd', transactionId: o.id, sourceType: o.source_type, sourceId: o.source_id });

    const checks = [
      { id: 'a', name: 'SUCCEEDED payments by purpose equal ledger income by category', ok: !mismatches.some((m) => m.check === 'a'), byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, paymentsPaise: r.payments_paise, ledgerPaise: r.ledger_paise })) },
      { id: 'b', name: 'Every SUCCEEDED payment has a ledger row', ok: missing.length === 0, count: missing.length },
      { id: 'c', name: 'PAID expenses equal ledger OUT', ok: out.expenses_paise === out.ledger_paise, paidExpensesPaise: out.expenses_paise, ledgerOutPaise: out.ledger_paise },
      { id: 'd', name: 'No ledger row whose source is not SUCCEEDED/PAID', ok: orphans.length === 0, count: orphans.length },
    ];
    return { ok: mismatches.length === 0, checks, mismatches };
  }

  return Object.freeze({ summary, transactions, reconcile });
}
