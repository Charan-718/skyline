import { now } from '../../shared/clock.js';
import { config } from '../../config/index.js';
import { withTransaction } from '../../db/transaction.js';

export function createReservationExpiryJob({ db, paymentService }) {
  return {
    name: 'reservation-expiry',
    async execute() {
      const t = now();
      const bookings = await db('bookings')
        .where({ status: 'PENDING_PAYMENT' })
        .andWhere('hold_expires_at', '<', t)
        .select('*');

      let expired = 0;
      for (const b of bookings) {
        const pay = await db('payments')
          .where({ booking_id: b.id })
          .whereIn('status', ['INITIATED', 'PENDING'])
          .first();
        if (pay) {
          await withTransaction((trx) =>
            paymentService.settle(pay.id, 'EXPIRED', trx, { failureReason: 'HOLD_EXPIRED' }),
          );
        }
        expired += 1;
      }

      const autopayTimeoutMs = config.AUTOPAY_PENDING_TIMEOUT_HOURS * 60 * 60 * 1000;
      const cutoff = new Date(now().getTime() - autopayTimeoutMs);
      const autopayPayments = await db('payments')
        .where({ method: 'SIMULATED_AUTOPAY', status: 'PENDING' })
        .andWhere('created_at', '<', cutoff);

      for (const p of autopayPayments) {
        await withTransaction((trx) =>
          paymentService.settle(p.id, 'EXPIRED', trx, { failureReason: 'AUTOPAY_TIMEOUT' }),
        );
      }

      return { bookingsExpired: expired, autopayExpired: autopayPayments.length };
    },
  };
}
