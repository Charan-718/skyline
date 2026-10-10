import { targetOf } from '../domain/paymentStateMachine.js';

// JSON shape of a payment (camelCase, ISO-8601 UTC instants, integer paise — LLD conventions).
const iso = (value) => (value ? new Date(value).toISOString() : null);

export function toPaymentDto(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    purpose: row.purpose,
    target: targetOf(row),
    amountPaise: row.amount_paise,
    currency: row.currency,
    method: row.method,
    isSimulated: row.is_simulated,
    status: row.status,
    reference: row.reference,
    failureReason: row.failure_reason,
    createdAt: iso(row.created_at),
    settledAt: iso(row.settled_at),
  };
}
