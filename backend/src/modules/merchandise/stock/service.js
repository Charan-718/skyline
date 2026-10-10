import { appError } from '../../../shared/errors.js';
import { record as auditRecord } from '../../../shared/audit.js';
import { adjustmentProblems, available, lowStockAction } from '../domain/stockRules.js';
import * as catalogue from '../catalogue/repository.js';
import * as repository from './repository.js';

// Stock adjustments, inventory and low-stock alerts (LLD §2.8, §4.7, §5.10; T-61).

export function createStockService({ db, withTransaction, clock, access, clubs, notifications }) {
  /**
   * lowStock.evaluate(trx, variantId) — after reserve, release, sale, restock, adjustment and
   * threshold change. available ≤ threshold and no OPEN alert -> open one and email every club
   * head once (dedupe low-stock:{alertId}:{userId}); available > threshold -> resolve.
   */
  async function evaluate(trx, variantId) {
    const v = await trx('product_variants as v').join('products as p', 'p.id', 'v.product_id').where('v.id', variantId).first('v.*', 'p.name as product_name');
    const now = clock.now();
    if (lowStockAction(v) === 'RESOLVE') {
      await repository.resolveAlert(trx, variantId, now);
      return null;
    }
    const alert = await repository.openAlert(trx, { variantId, clubId: v.club_id, available: available(v), threshold: v.low_stock_threshold, now });
    if (!alert) return null;
    const heads = await clubs.listRoleHolders(v.club_id, 'CLUB_HEAD', { trx });
    await notifications.enqueue(
      trx,
      heads.map((h) => ({
        recipientUserId: h.userId,
        clubId: v.club_id,
        channel: 'EMAIL',
        template: 'LOW_STOCK_ALERT',
        payload: {
          productName: v.product_name,
          sizeLabel: v.size_label,
          available: available(v),
          threshold: v.low_stock_threshold,
          inventoryUrl: `/manage/${v.club_id}/merchandise`,
        },
        dedupeKey: `low-stock:${alert.id}:${h.userId}`,
      })),
    );
    return alert;
  }

  /** POST /variants/:id/stock-adjustments (CH, [IDEM]). */
  async function adjust(actor, variantId, { type, quantity, reason }, { requestId } = {}) {
    const variant = await catalogue.findVariant(db, variantId);
    if (!variant) throw appError('NOT_FOUND');
    await access.requireRole(actor, variant.club_id, ['CLUB_HEAD']);
    const problems = adjustmentProblems({ type, quantity });
    if (problems.length) throw appError('VALIDATION_FAILED', { fields: problems });
    return withTransaction(async (trx) => {
      const updated = await repository.adjustOnHand(trx, variantId, quantity);
      if (!updated) {
        const current = await catalogue.findVariant(trx, variantId);
        throw appError('STOCK_BELOW_RESERVED', { stockOnHand: current.stock_on_hand, stockReserved: current.stock_reserved });
      }
      await repository.insertMovement(trx, { variant_id: variantId, club_id: updated.club_id, type, quantity, reason, actor_user_id: actor.userId });
      await evaluate(trx, variantId);
      await auditRecord(trx, {
        actorUserId: actor.userId,
        clubId: updated.club_id,
        action: 'STOCK_ADJUSTED',
        entityType: 'product_variant',
        entityId: variantId,
        metadata: { type, quantity, reason },
        requestId,
      });
      return updated;
    });
  }

  const inventory = (clubId) => repository.inventory(db, clubId);
  const alerts = (clubId, query) => repository.listAlerts(db, clubId, query);

  return Object.freeze({ evaluate, adjust, inventory, alerts });
}
