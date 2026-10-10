import { pickupCode } from '../../../shared/tokens.js';
import * as stockRepo from '../stock/repository.js';
import * as repository from '../orders/repository.js';

// PaymentPurposeHandler for MERCH_ORDER (LLD §2.10, §5.9). Registered in container.js.
//   onSucceeded: order → CONFIRMED + pickup code; reservation becomes a SALE (stock decremented
//                only now, PR-MER-07); ledger IN MERCH_SALE; low-stock re-evaluated.
//   onFailed:    order → CANCELLED (FAILED / USER_CANCELLED) or EXPIRED (hold); release stock.
// Runs inside settle()'s transaction, only when the conditional payment update returned a row.

const PICKUP_ATTEMPTS = 3;

export function createOrderPaymentHandler({ ledger, stock, clock }) {
  async function confirm(trx, orderId, now) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // Savepoint: a pickup-code collision must not abort settle()'s transaction.
        return await trx.transaction((sp) =>
          repository.transition(sp, orderId, 'PENDING_PAYMENT', { status: 'CONFIRMED', pickup_code: pickupCode(), confirmed_at: now }),
        );
      } catch (err) {
        if (err?.code === '23505' && err.constraint === 'orders_pickup_code_key' && attempt < PICKUP_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  async function itemsSorted(trx, orderId) {
    return trx('order_items').where({ order_id: orderId }).orderBy('variant_id');
  }

  return Object.freeze({
    purpose: 'MERCH_ORDER',

    async onSucceeded(payment, trx) {
      const now = clock.now();
      const orderId = payment.orderId ?? payment.order_id;
      const order = await confirm(trx, orderId, now);
      if (!order) throw new Error(`MERCH_ORDER payment ${payment.id} succeeded but order ${orderId} is not PENDING_PAYMENT`);
      for (const item of await itemsSorted(trx, order.id)) {
        await stockRepo.sell(trx, item.variant_id, item.quantity);
        await stockRepo.insertMovement(trx, { variant_id: item.variant_id, club_id: order.club_id, type: 'SALE', quantity: -item.quantity, order_id: order.id });
        await stock.evaluate(trx, item.variant_id);
      }
      await ledger.postPaymentIncome(trx, payment, { orderId: order.id, description: `Merchandise order ${order.pickup_code}` });
      return { orderStatus: order.status, pickupCode: order.pickup_code };
    },

    async onFailed(payment, reason, trx) {
      const status = reason === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
      const orderId = payment.orderId ?? payment.order_id;
      const order = await repository.transition(trx, orderId, 'PENDING_PAYMENT', { status, cancelled_at: clock.now(), cancel_reason: reason });
      if (!order) return null;
      for (const item of await itemsSorted(trx, order.id)) {
        await stockRepo.release(trx, item.variant_id, item.quantity);
        await stockRepo.insertMovement(trx, { variant_id: item.variant_id, club_id: order.club_id, type: 'RELEASE', quantity: -item.quantity, order_id: order.id });
        await stock.evaluate(trx, item.variant_id);
      }
      return { orderStatus: order.status };
    },
  });
}
