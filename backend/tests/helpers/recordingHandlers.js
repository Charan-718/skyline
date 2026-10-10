// Payment purpose handlers for tests (Group 1 purposes; MERCH_ORDER uses Group 2's real handler). They behave like the real Group 1/Group 2 handlers in the
// one way settle() depends on: on success they post the income row through ledger.post
// (LLD §5.2, §5.7, §5.9). Every call is recorded so tests can count handler executions.

export function createRecordingHandlers(
  ledger,
  { purposes = ['MEMBERSHIP_JOIN', 'MEMBERSHIP_RENEWAL', 'EVENT_TICKET'], failOn, delayMs = 0 } = {},
) {
  const calls = [];
  const handlers = purposes.map((purpose) => ({
    purpose,
    async onSucceeded(payment, trx) {
      calls.push({ purpose, hook: 'onSucceeded', paymentId: payment.id });
      if (failOn === 'onSucceeded') throw new Error('handler failure (test)');
      // Holding the transaction open widens the race window for concurrency tests.
      if (delayMs) await trx.raw('SELECT pg_sleep(?)', [delayMs / 1000]);
      await ledger.postPaymentIncome(trx, payment);
      return { handled: purpose };
    },
    async onFailed(payment, reason, trx) {
      calls.push({ purpose, hook: 'onFailed', paymentId: payment.id, reason });
      if (failOn === 'onFailed') throw new Error('handler failure (test)');
      if (delayMs) await trx.raw('SELECT pg_sleep(?)', [delayMs / 1000]);
      return { released: true };
    },
  }));
  return { handlers, calls };
}
