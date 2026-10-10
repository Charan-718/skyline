// financial_transactions data access. Insert-only: there is no update or delete function, and a
// trigger rejects both at the database (LLD §3.1).

const COLUMNS = {
  clubId: 'club_id',
  direction: 'direction',
  category: 'category',
  amountPaise: 'amount_paise',
  sourceType: 'source_type',
  sourceId: 'source_id',
  paymentId: 'payment_id',
  expenseId: 'expense_id',
  eventId: 'event_id',
  fundraiserId: 'fundraiser_id',
  membershipId: 'membership_id',
  orderId: 'order_id',
  payerUserId: 'payer_user_id',
  recordedBy: 'recorded_by',
  approvedBy: 'approved_by',
  description: 'description',
  reference: 'reference',
  evidenceFileId: 'evidence_file_id',
  occurredAt: 'occurred_at',
};

/** INSERT … ON CONFLICT (source_type, source_id) DO NOTHING. Returns the new row, or null on conflict. */
export async function insertIfAbsent(trx, entry) {
  const row = {};
  for (const [key, column] of Object.entries(COLUMNS)) row[column] = entry[key] ?? null;
  const [inserted] = await trx('financial_transactions')
    .insert(row)
    .onConflict(['source_type', 'source_id'])
    .ignore()
    .returning('*');
  return inserted ?? null;
}

export async function findBySource(trx, sourceType, sourceId) {
  return trx('financial_transactions').where({ source_type: sourceType, source_id: sourceId }).first();
}

/** Per fundraiser: income = Σ IN FUNDRAISER_INCOME, expensesPaid = Σ OUT (LLD §2.9 money). */
export async function sumsByFundraiser(conn, fundraiserIds) {
  if (!fundraiserIds.length) return [];
  return conn('financial_transactions')
    .whereIn('fundraiser_id', fundraiserIds)
    .groupBy('fundraiser_id')
    .select(
      'fundraiser_id',
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE direction = 'IN' AND category = 'FUNDRAISER_INCOME'), 0)::bigint AS income"),
      conn.raw("coalesce(sum(amount_paise) FILTER (WHERE direction = 'OUT'), 0)::bigint AS expenses_paid"),
    );
}
