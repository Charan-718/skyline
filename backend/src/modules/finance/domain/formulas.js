import { LEDGER_CATEGORIES } from './ledgerRules.js';

// Finance formulas (LLD §2.10). Pure: inputs are ledger/expense aggregates (integer paise).
//   totalIncome          Σ ledger IN (in period)
//   incomeByCategory     Σ ledger IN per category (every IN category present, 0 when none)
//   totalPaidExpenses    Σ ledger OUT (in period)
//   availableBalance     all-time Σ IN − Σ OUT (no period filter)
//   approvedUnpaidTotal  Σ expenses APPROVED
//   pendingReviewTotal   Σ expenses SUBMITTED — reported, never subtracted from any balance
//   projectedBalance     availableBalance − approvedUnpaidTotal
//   budget               spent = Σ OUT in period; committed = Σ APPROVED with incurredOn in period;
//                        remaining = amount − spent; remainingAfterCommitted = remaining − committed
// Refunds are not supported (OD-08): gross recorded revenue = net.

/** Postgres `bigint` aggregates arrive as strings — always coerce before math. */
export function paiseInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function summarize({ periodByCategory, allTimeIn, allTimeOut, approvedUnpaid, pendingReview }) {
  const incomeByCategory = Object.fromEntries(
    LEDGER_CATEGORIES.IN.map((c) => [c, paiseInt(periodByCategory.IN?.[c])]),
  );
  const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0);
  const totalPaidExpenses = LEDGER_CATEGORIES.OUT.reduce(
    (a, c) => a + paiseInt(periodByCategory.OUT?.[c]),
    0,
  );
  const availableBalance = paiseInt(allTimeIn) - paiseInt(allTimeOut);
  return {
    totalIncomePaise: totalIncome,
    incomeByCategory,
    totalPaidExpensesPaise: totalPaidExpenses,
    availableBalancePaise: availableBalance,
    approvedUnpaidTotalPaise: paiseInt(approvedUnpaid),
    pendingReviewTotalPaise: paiseInt(pendingReview),
    projectedBalancePaise: availableBalance - paiseInt(approvedUnpaid),
  };
}

export function budgetFigures({ amount, spent, committed }) {
  const remaining = amount - spent;
  return {
    amountPaise: amount,
    spentPaise: spent,
    committedPaise: committed,
    remainingPaise: remaining,
    remainingAfterCommittedPaise: remaining - committed,
  };
}
