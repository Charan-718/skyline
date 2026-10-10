import { AppError } from '../../../shared/errors.js';
import { now } from '../../../shared/clock.js';
import { logger } from '../../../shared/logger.js';

export function createLedgerService({ ledgerRepository }) {
  return {
    /**
     * Append-only ledger post with idempotent source key.
     * @param {import('knex').Knex.Transaction} trx
     */
    async post(trx, entry) {
      if (!entry.amountPaise || entry.amountPaise <= 0) {
        throw new AppError('VALIDATION_FAILED', 400, 'Invalid ledger amount');
      }

      const row = {
        club_id: entry.clubId,
        direction: entry.direction,
        category: entry.category,
        amount_paise: entry.amountPaise,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        payment_id: entry.paymentId ?? (entry.sourceType === 'PAYMENT' ? entry.sourceId : null),
        expense_id: entry.expenseId ?? null,
        event_id: entry.eventId ?? null,
        fundraiser_id: entry.fundraiserId ?? null,
        membership_id: entry.membershipId ?? null,
        order_id: entry.orderId ?? null,
        payer_user_id: entry.payerUserId ?? null,
        recorded_by: entry.recordedBy ?? null,
        approved_by: entry.approvedBy ?? null,
        description: entry.description,
        reference: entry.reference ?? null,
        evidence_file_id: entry.evidenceFileId ?? null,
        occurred_at: entry.occurredAt ?? now(),
      };

      const inserted = await trx('financial_transactions')
        .insert(row)
        .onConflict(['source_type', 'source_id'])
        .ignore()
        .returning('*');

      if (inserted.length > 0) {
        return inserted[0];
      }

      const existing = await ledgerRepository.findBySource(entry.sourceType, entry.sourceId, trx);
      if (
        existing &&
        Number(existing.amountPaise) === Number(entry.amountPaise) &&
        existing.category === entry.category
      ) {
        return existing;
      }

      logger.error({ entry, existing }, 'Ledger conflict');
      throw new AppError('LEDGER_CONFLICT', 500, 'Ledger entry conflict');
    },
  };
}
