import { randomUUID } from 'node:crypto';
import { appError } from '../../../shared/errors.js';
import { record as auditRecord } from '../../../shared/audit.js';
import { startOfDay } from '../../../shared/dates.js';

// Fundraiser income entries (LLD §4.9; T-82). The ledger row IS the record (OQ-15): source
// INCOME_ENTRY with a fresh uuid; duplicates are prevented by the Idempotency-Key.

export function createIncomeService({ withTransaction, clock, access, ledger, files, assertFundraiserLinkable, timeZone }) {
  async function record(actor, clubId, dto, file, { requestId } = {}) {
    await access.requireRole(actor, clubId, ['TREASURER']);
    await assertFundraiserLinkable(clubId, dto.fundraiserId);
    if (dto.receivedOn > clock.todayIST()) {
      throw appError('VALIDATION_FAILED', { fields: [{ path: 'receivedOn', message: 'receivedOn cannot be in the future' }] });
    }

    const post = (trx, evidence) =>
      ledger.post(trx, {
        clubId,
        direction: 'IN',
        category: 'FUNDRAISER_INCOME',
        amountPaise: dto.amountPaise,
        sourceType: 'INCOME_ENTRY',
        sourceId: randomUUID(),
        fundraiserId: dto.fundraiserId,
        recordedBy: actor.userId,
        description: dto.description,
        reference: dto.reference ?? null,
        evidenceFileId: evidence?.id ?? null,
        occurredAt: startOfDay(dto.receivedOn, timeZone), // OQ-16
      });
    const audit = (trx, row) =>
      auditRecord(trx, {
        actorUserId: actor.userId,
        clubId,
        action: 'INCOME_RECORDED',
        entityType: 'financial_transaction',
        entityId: row.id,
        metadata: { fundraiserId: dto.fundraiserId, amountPaise: dto.amountPaise },
        requestId,
      });

    if (!file) {
      return withTransaction(async (trx) => {
        const { transaction } = await post(trx, null);
        await audit(trx, transaction);
        return transaction;
      });
    }
    return files.withStoredFile(file, { clubId, uploadedBy: actor.userId }, (insertFile) =>
      withTransaction(async (trx) => {
        const { transaction } = await post(trx, await insertFile(trx));
        await audit(trx, transaction);
        return transaction;
      }),
    );
  }

  return Object.freeze({ record });
}
