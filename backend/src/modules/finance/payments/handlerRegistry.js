import { PAYMENT_PURPOSES } from '../domain/paymentStateMachine.js';

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
    if (!handler) throw new Error(`no payment handler registered for ${purpose}`);
    return handler;
  }

  return Object.freeze({ register, get, purposes: () => [...handlers.keys()] });
}

/** @deprecated Group 1 name — same registry as createHandlerRegistry. */
export const createPaymentHandlerRegistry = createHandlerRegistry;
