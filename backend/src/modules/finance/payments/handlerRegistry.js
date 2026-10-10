import { PAYMENT_PURPOSES } from '../domain/paymentStateMachine.js';

// PaymentPurposeHandler { purpose, onSucceeded(payment, trx), onFailed(payment, reason, trx) }
// (LLD §2.10). Handlers are registered in container.js so finance/payments never imports the
// memberships, events or merchandise modules (LLD §1.2). A handler may return a plain object;
// it becomes `result` in the simulate response (OQ-13).

export function createHandlerRegistry() {
  const handlers = new Map();

  function register(handler) {
    if (!handler || !PAYMENT_PURPOSES.includes(handler.purpose)) {
      throw new TypeError(`payment handler has unknown purpose: ${handler?.purpose}`);
    }
    if (typeof handler.onSucceeded !== 'function' || typeof handler.onFailed !== 'function') {
      throw new TypeError(`payment handler for ${handler.purpose} must define onSucceeded and onFailed`);
    }
    if (handlers.has(handler.purpose)) throw new Error(`payment handler for ${handler.purpose} is already registered`);
    handlers.set(handler.purpose, handler);
  }

  function get(purpose) {
    const handler = handlers.get(purpose);
    // Programming error, not a client error: surfaces as 500 INTERNAL_ERROR and rolls back.
    if (!handler) throw new Error(`no payment handler registered for ${purpose}`);
    return handler;
  }

  return Object.freeze({ register, get, purposes: () => [...handlers.keys()] });
}
