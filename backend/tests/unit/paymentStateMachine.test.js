import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isTerminal,
  planSimulation,
  targetOf,
  validateNewPayment,
} from '../../src/modules/finance/domain/paymentStateMachine.js';

const termId = '11111111-1111-4111-8111-111111111111';

describe('payment state machine (LLD §2.10)', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('INITIATED', 'PENDING')).toBe(true);
    expect(canTransition('INITIATED', 'SUCCEEDED')).toBe(true);
    expect(canTransition('PENDING', 'FAILED')).toBe(true);
    expect(canTransition('PENDING', 'EXPIRED')).toBe(true);
    expect(canTransition('PENDING', 'PENDING')).toBe(false);
    expect(canTransition('PENDING', 'INITIATED')).toBe(false);
    for (const terminal of ['SUCCEEDED', 'FAILED', 'EXPIRED']) {
      expect(isTerminal(terminal)).toBe(true);
      for (const to of ['INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED']) expect(canTransition(terminal, to)).toBe(false);
    }
  });

  it('plans simulate requests', () => {
    const p = (status, method = 'SIMULATED') => ({ status, method });
    expect(planSimulation(p('INITIATED'), 'SUCCEEDED')).toBe('SETTLE');
    expect(planSimulation(p('PENDING'), 'FAILED')).toBe('SETTLE');
    expect(planSimulation(p('INITIATED'), 'PENDING')).toBe('MARK_PENDING');
    expect(planSimulation(p('PENDING'), 'PENDING')).toBe('NOOP');
    expect(planSimulation(p('SUCCEEDED'), 'FAILED')).toBe('NOOP');
    expect(planSimulation(p('EXPIRED'), 'SUCCEEDED')).toBe('NOOP');
    expect(planSimulation(p('INITIATED', 'SIMULATED_AUTOPAY'), 'SUCCEEDED')).toBe('FORBIDDEN');
    expect(planSimulation(p('PENDING', 'SIMULATED_AUTOPAY'), 'SUCCEEDED', { devOverride: true })).toBe('SETTLE');
    expect(() => planSimulation(p('INITIATED'), 'EXPIRED')).toThrow(TypeError);
  });

  it('validates new payments: purpose ↔ target, positive integer amount, method', () => {
    const ok = { purpose: 'MEMBERSHIP_JOIN', method: 'SIMULATED', amountPaise: 50000, membershipTermId: termId };
    expect(validateNewPayment(ok)).toEqual([]);
    expect(validateNewPayment({ ...ok, amountPaise: 0 })).toHaveLength(1);
    expect(validateNewPayment({ ...ok, amountPaise: 10.5 })).toHaveLength(1);
    expect(validateNewPayment({ ...ok, method: 'CARD' })).toHaveLength(1);
    expect(validateNewPayment({ ...ok, purpose: 'EVENT_TICKET' })).toEqual(['EVENT_TICKET requires bookingId']);
    expect(validateNewPayment({ ...ok, bookingId: termId })).toHaveLength(1);
    expect(validateNewPayment({ ...ok, membershipTermId: undefined })).toHaveLength(1);
  });

  it('describes the target as {type, id}', () => {
    expect(targetOf({ membership_term_id: termId })).toEqual({ type: 'MEMBERSHIP_TERM', id: termId });
    expect(targetOf({ booking_id: termId })).toEqual({ type: 'BOOKING', id: termId });
    expect(targetOf({ order_id: termId })).toEqual({ type: 'ORDER', id: termId });
  });
});
