import { describe, expect, it } from 'vitest';
import { createHandlerRegistry } from '../../src/modules/finance/payments/handlerRegistry.js';
import { createMembershipPaymentHandlers } from '../../src/modules/memberships/index.js';

const handler = (purpose) => ({ purpose, onSucceeded: async () => null, onFailed: async () => null });

describe('payment handler registry (LLD §2.10)', () => {
  it('registers one handler per purpose and returns it', () => {
    const r = createHandlerRegistry();
    const h = handler('EVENT_TICKET');
    r.register(h);
    expect(r.get('EVENT_TICKET')).toBe(h);
    expect(r.purposes()).toEqual(['EVENT_TICKET']);
  });

  it('rejects duplicates, unknown purposes and incomplete handlers', () => {
    const r = createHandlerRegistry();
    r.register(handler('MERCH_ORDER'));
    expect(() => r.register(handler('MERCH_ORDER'))).toThrow(/already registered/);
    expect(() => r.register(handler('DONATION'))).toThrow(/unknown purpose/);
    expect(() => r.register({ purpose: 'EVENT_TICKET', onSucceeded: async () => null })).toThrow(/onFailed/);
  });

  it('an unregistered purpose is a programming error (500), not a client error', () => {
    expect(() => createHandlerRegistry().get('MEMBERSHIP_JOIN')).toThrow(/no payment handler/);
  });

  it('TODO(group1) membership handler stub records calls for JOIN and RENEWAL', async () => {
    const { handlers, calls } = createMembershipPaymentHandlers();
    expect(handlers.map((h) => h.purpose)).toEqual(['MEMBERSHIP_JOIN', 'MEMBERSHIP_RENEWAL']);
    await handlers[0].onSucceeded({ id: 'p1' });
    await handlers[1].onFailed({ id: 'p2' }, 'EXPIRED');
    expect(calls).toEqual([
      { purpose: 'MEMBERSHIP_JOIN', hook: 'onSucceeded', paymentId: 'p1' },
      { purpose: 'MEMBERSHIP_RENEWAL', hook: 'onFailed', paymentId: 'p2', reason: 'EXPIRED' },
    ]);
  });
});
