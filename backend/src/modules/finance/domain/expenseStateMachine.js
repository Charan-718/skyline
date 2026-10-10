// Expense lifecycle (LLD §2.10). Pure.
//   — submit reimbursement → SUBMITTED              (no ledger)
//   — record direct expense → PAID                  (ledger OUT DIRECT_EXPENSE)
//   SUBMITTED → APPROVED | REJECTED                 (no ledger)
//   APPROVED  → PAID                                (ledger OUT REIMBURSEMENT_PAYOUT)

export const EXPENSE_KINDS = Object.freeze(['REIMBURSEMENT', 'DIRECT']);
export const EXPENSE_STATUSES = Object.freeze(['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']);

const TRANSITIONS = Object.freeze({
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: [],
  PAID: [],
});

export const canTransitionExpense = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

/** The status a transition must start from, used as the conditional-update guard. */
export const REQUIRED_STATUS = Object.freeze({ APPROVED: 'SUBMITTED', REJECTED: 'SUBMITTED', PAID: 'APPROVED' });

/** Ledger effect of a status: only PAID moves money. */
export const ledgerCategoryFor = (expense) =>
  expense.status === 'PAID' ? (expense.kind === 'DIRECT' ? 'DIRECT_EXPENSE' : 'REIMBURSEMENT_PAYOUT') : null;

/**
 * Date checks the LLD leaves open (OQ-16, OQ-43): incurredOn ≤ today; paidOn ≤ today and
 * paidOn ≥ incurredOn. Returns a list of {path, message}.
 */
export function dateProblems({ incurredOn, paidOn, today }) {
  const problems = [];
  if (incurredOn && incurredOn > today) problems.push({ path: 'incurredOn', message: 'incurredOn cannot be in the future' });
  if (paidOn && paidOn > today) problems.push({ path: 'paidOn', message: 'paidOn cannot be in the future' });
  if (paidOn && incurredOn && paidOn < incurredOn) problems.push({ path: 'paidOn', message: 'paidOn cannot be before incurredOn' });
  return problems;
}
