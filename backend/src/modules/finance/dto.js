// JSON shapes for finance resources (camelCase, integer paise, ISO instants, YYYY-MM-DD dates).
const iso = (v) => (v ? new Date(v).toISOString() : null);
const person = (id, names) => (id ? { id, fullName: names.get(id) ?? null } : null);

export function toExpenseDto(e, { receipts = new Map(), names = new Map() } = {}) {
  const r = receipts.get(e.receipt_file_id);
  return {
    id: e.id,
    clubId: e.club_id,
    kind: e.kind,
    title: e.title,
    description: e.description,
    amountPaise: e.amount_paise,
    incurredOn: e.incurred_on,
    eventId: e.event_id,
    fundraiserId: e.fundraiser_id,
    // Storage location is never exposed; the file is fetched through GET /expenses/:id/receipt.
    receipt: r ? { fileId: r.id, originalName: r.original_name, mimeType: r.mime_type, sizeBytes: r.size_bytes } : { fileId: e.receipt_file_id },
    submittedBy: person(e.submitted_by, names),
    payee: person(e.payee_user_id, names),
    status: e.status,
    decidedBy: person(e.decided_by, names),
    decidedAt: iso(e.decided_at),
    decisionNote: e.decision_note,
    paidBy: person(e.paid_by, names),
    paidAt: iso(e.paid_at),
    payoutReference: e.payout_reference,
    createdAt: iso(e.created_at),
    updatedAt: iso(e.updated_at),
  };
}

export function toTransactionDto(t, names = new Map()) {
  return {
    id: t.id,
    clubId: t.club_id,
    direction: t.direction,
    category: t.category,
    amountPaise: t.amount_paise,
    currency: t.currency,
    status: t.status,
    source: { type: t.source_type, id: t.source_id },
    paymentId: t.payment_id,
    expenseId: t.expense_id,
    eventId: t.event_id,
    fundraiserId: t.fundraiser_id,
    membershipId: t.membership_id,
    orderId: t.order_id,
    payer: person(t.payer_user_id, names),
    recordedBy: person(t.recorded_by, names),
    approvedBy: person(t.approved_by, names),
    description: t.description,
    reference: t.reference,
    evidenceFileId: t.evidence_file_id,
    occurredAt: iso(t.occurred_at),
    createdAt: iso(t.created_at),
  };
}

export function toBudgetDto({ budget: b, figures }) {
  return {
    id: b.id,
    clubId: b.club_id,
    name: b.name,
    periodStart: b.period_start,
    periodEnd: b.period_end,
    notes: b.notes,
    ...figures,
    createdAt: iso(b.created_at),
    updatedAt: iso(b.updated_at),
  };
}
