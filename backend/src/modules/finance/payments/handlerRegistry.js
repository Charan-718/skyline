export function createPaymentHandlerRegistry() {
  /** @type {Map<string, import('./service.js').PaymentPurposeHandler>} */
  const handlers = new Map();

  return {
    register(handler) {
      handlers.set(handler.purpose, handler);
    },
    get(purpose) {
      const h = handlers.get(purpose);
      if (!h) throw new Error(`No payment handler for purpose ${purpose}`);
      return h;
    },
  };
}
