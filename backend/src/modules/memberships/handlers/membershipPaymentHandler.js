// TODO(group1): stub. Group 1 (T-33/T-34) replaces this with the real handler (LLD §5.2):
// activate/extend the membership, post MEMBERSHIP_DUES / MEMBERSHIP_RENEWAL via
// ledger.postPaymentIncome, enqueue AUTOPAY_RESULT. Until then it only records the call so the
// handler registry and settle() wiring can be exercised.

export function createMembershipPaymentHandlers() {
  const calls = [];
  const make = (purpose) =>
    Object.freeze({
      purpose,
      async onSucceeded(payment) {
        calls.push({ purpose, hook: 'onSucceeded', paymentId: payment.id });
        return null;
      },
      async onFailed(payment, reason) {
        calls.push({ purpose, hook: 'onFailed', paymentId: payment.id, reason });
        return null;
      },
    });
  return { handlers: [make('MEMBERSHIP_JOIN'), make('MEMBERSHIP_RENEWAL')], calls };
}
