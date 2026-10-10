// Ledger entry rules (LLD §2.10, §3.1 financial_transactions, ADR-015). Pure: no I/O.

export const LEDGER_CATEGORIES = Object.freeze({
  IN: Object.freeze(['MEMBERSHIP_DUES', 'MEMBERSHIP_RENEWAL', 'TICKET_SALE', 'MERCH_SALE', 'FUNDRAISER_INCOME']),
  OUT: Object.freeze(['REIMBURSEMENT_PAYOUT', 'DIRECT_EXPENSE']),
});

export const LEDGER_SOURCE_TYPES = Object.freeze(['PAYMENT', 'EXPENSE', 'INCOME_ENTRY']);

// Income category for a SUCCEEDED payment of each purpose.
export const PAYMENT_PURPOSE_CATEGORY = Object.freeze({
  MEMBERSHIP_JOIN: 'MEMBERSHIP_DUES',
  MEMBERSHIP_RENEWAL: 'MEMBERSHIP_RENEWAL',
  EVENT_TICKET: 'TICKET_SALE',
  MERCH_ORDER: 'MERCH_SALE',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a list of problems with a ledger entry (empty = valid). */
export function validateLedgerEntry(e) {
  const problems = [];
  if (!UUID.test(e.clubId ?? '')) problems.push('clubId must be a uuid');
  if (!['IN', 'OUT'].includes(e.direction)) problems.push('direction must be IN or OUT');
  else if (!LEDGER_CATEGORIES[e.direction].includes(e.category)) problems.push(`category ${e.category} is not valid for ${e.direction}`);
  if (!Number.isSafeInteger(e.amountPaise) || e.amountPaise <= 0) problems.push('amountPaise must be an integer > 0');
  if (!LEDGER_SOURCE_TYPES.includes(e.sourceType)) problems.push('unknown sourceType');
  if (!UUID.test(e.sourceId ?? '')) problems.push('sourceId must be a uuid');
  if (e.sourceType === 'PAYMENT' && e.paymentId !== e.sourceId) problems.push('PAYMENT entries need paymentId = sourceId');
  if (e.sourceType === 'EXPENSE' && e.expenseId !== e.sourceId) problems.push('EXPENSE entries need expenseId = sourceId');
  if (e.sourceType === 'PAYMENT' && e.direction !== 'IN') problems.push('PAYMENT entries are income (IN)');
  if (e.sourceType === 'EXPENSE' && e.direction !== 'OUT') problems.push('EXPENSE entries are expenses (OUT)');
  if (e.sourceType === 'INCOME_ENTRY' && e.category !== 'FUNDRAISER_INCOME') problems.push('INCOME_ENTRY entries are FUNDRAISER_INCOME');
  if (typeof e.description !== 'string' || e.description.trim() === '') problems.push('description is required');
  if (!(e.occurredAt instanceof Date) || Number.isNaN(e.occurredAt.getTime())) problems.push('occurredAt must be a Date');
  return problems;
}

/** True when an already-posted row records the same money as the new entry (LLD §5.12). */
export function samePosting(existing, entry) {
  return (
    existing.club_id === entry.clubId &&
    existing.direction === entry.direction &&
    existing.category === entry.category &&
    existing.amount_paise === entry.amountPaise
  );
}
