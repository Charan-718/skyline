// Simulated payment rules (LLD §2.10). Pure: no I/O.

export const PAYMENT_STATUS = Object.freeze({
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
});

export const OPEN_STATUSES = Object.freeze(['INITIATED', 'PENDING']);
export const TERMINAL_STATUSES = Object.freeze(['SUCCEEDED', 'FAILED', 'EXPIRED']);
export const SETTLE_OUTCOMES = Object.freeze(['SUCCEEDED', 'FAILED', 'EXPIRED']);
export const SIMULATE_OUTCOMES = Object.freeze(['SUCCEEDED', 'FAILED', 'PENDING']);

export const PAYMENT_PURPOSES = Object.freeze(['MEMBERSHIP_JOIN', 'MEMBERSHIP_RENEWAL', 'EVENT_TICKET', 'MERCH_ORDER']);
export const PAYMENT_METHODS = Object.freeze(['SIMULATED', 'SIMULATED_AUTOPAY']);

// Which target column each purpose must set; exactly one target per payment.
export const PURPOSE_TARGET = Object.freeze({
  MEMBERSHIP_JOIN: 'membershipTermId',
  MEMBERSHIP_RENEWAL: 'membershipTermId',
  EVENT_TICKET: 'bookingId',
  MERCH_ORDER: 'orderId',
});

const TARGET_TYPES = Object.freeze({ membershipTermId: 'MEMBERSHIP_TERM', bookingId: 'BOOKING', orderId: 'ORDER' });

// from -> allowed next statuses
const TRANSITIONS = Object.freeze({
  INITIATED: ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED'],
  PENDING: ['SUCCEEDED', 'FAILED', 'EXPIRED'],
  SUCCEEDED: [],
  FAILED: [],
  EXPIRED: [],
});

export const isTerminal = (status) => TERMINAL_STATUSES.includes(status);
export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

/**
 * Validates the input of payments.create. Returns a list of problems (empty = valid).
 * Amount checks: integer paise > 0; method SIMULATED or SIMULATED_AUTOPAY; one matching target.
 */
export function validateNewPayment({ purpose, method, amountPaise, membershipTermId, bookingId, orderId }) {
  const problems = [];
  if (!PAYMENT_PURPOSES.includes(purpose)) problems.push(`unknown purpose ${purpose}`);
  if (!PAYMENT_METHODS.includes(method)) problems.push(`unknown method ${method}`);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) problems.push('amountPaise must be an integer > 0');
  const targets = { membershipTermId, bookingId, orderId };
  const set = Object.keys(targets).filter((k) => targets[k] != null);
  if (set.length !== 1) problems.push('exactly one of membershipTermId, bookingId, orderId is required');
  else if (PURPOSE_TARGET[purpose] && set[0] !== PURPOSE_TARGET[purpose]) {
    problems.push(`${purpose} requires ${PURPOSE_TARGET[purpose]}`);
  }
  return problems;
}

/** Target of a payment row as {type, id} (OQ-24). */
export function targetOf(row) {
  if (row.membership_term_id) return { type: TARGET_TYPES.membershipTermId, id: row.membership_term_id };
  if (row.booking_id) return { type: TARGET_TYPES.bookingId, id: row.booking_id };
  return { type: TARGET_TYPES.orderId, id: row.order_id };
}

/**
 * What a simulate request does (LLD §4.4, OQ-31, OQ-32):
 *   FORBIDDEN    owner endpoint used on an AutoPay payment
 *   NOOP         terminal payment, or PENDING -> PENDING: return current state, no side effect
 *   MARK_PENDING INITIATED -> PENDING (status only)
 *   SETTLE       INITIATED/PENDING -> SUCCEEDED/FAILED via settle()
 */
export function planSimulation(payment, outcome, { devOverride = false } = {}) {
  if (!SIMULATE_OUTCOMES.includes(outcome)) throw new TypeError(`unknown outcome ${outcome}`);
  if (payment.method === 'SIMULATED_AUTOPAY' && !devOverride) return 'FORBIDDEN';
  if (isTerminal(payment.status)) return 'NOOP';
  if (outcome === 'PENDING') return payment.status === 'INITIATED' ? 'MARK_PENDING' : 'NOOP';
  return 'SETTLE';
}
