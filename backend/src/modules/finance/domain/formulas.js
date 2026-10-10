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

export function summarize({ periodByCategory, allTimeIn, allTimeOut, approvedUnpaid, pendingReview }) {
  const incomeByCategory = Object.fromEntries(LEDGER_CATEGORIES.IN.map((c) => [c, periodByCategory.IN?.[c] ?? 0]));
  const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0);
  const totalPaidExpenses = LEDGER_CATEGORIES.OUT.reduce((a, c) => a + (periodByCategory.OUT?.[c] ?? 0), 0);
  const availableBalance = allTimeIn - allTimeOut;
  return {
    totalIncomePaise: totalIncome,
    incomeByCategory,
    totalPaidExpensesPaise: totalPaidExpenses,
    availableBalancePaise: availableBalance,
    approvedUnpaidTotalPaise: approvedUnpaid,
    pendingReviewTotalPaise: pendingReview,
    projectedBalancePaise: availableBalance - approvedUnpaid,
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
