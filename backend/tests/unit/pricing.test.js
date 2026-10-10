import { describe, it, expect } from 'vitest';
import { createPricingPolicy } from '../../src/modules/pricing/PricingPolicy.js';
import { setClock, resetClock } from '../../src/shared/clock.js';

describe('PricingPolicy', () => {
  const baseEvent = {
    status: 'PUBLISHED',
    capacity: 100,
    seatsReserved: 0,
    memberPricePaise: 20000,
    nonMemberPricePaise: 25000,
    memberDiscountEligible: true,
    registrationOpensAt: '2026-01-01T00:00:00.000Z',
    registrationClosesAt: '2026-12-31T23:59:59.000Z',
    startsAt: '2027-01-01T18:00:00.000Z',
    earlyBirdMemberPricePaise: 15000,
    earlyBirdNonMemberPricePaise: 18000,
    earlyBirdEndsAt: '2026-06-30T23:59:59.000Z',
    earlyBirdQuantity: 1,
    earlyBirdReserved: 0,
  };

  it('TC-PRC-01 applies member discount on member price', () => {
    setClock('2026-03-01T12:00:00.000Z');
    const policy = createPricingPolicy(() => new Date('2026-03-01T12:00:00.000Z'), 'BEST_OF');
    const quote = policy.quoteTicket(baseEvent, { eventDiscountBps: 1000, earlyBirdAccess: false }, 0);
    expect(quote.final).toBe(18000);
    resetClock();
  });

  it('TC-PRC-02 early bird when remaining > 0', () => {
    setClock('2026-03-01T12:00:00.000Z');
    const policy = createPricingPolicy(() => new Date('2026-03-01T12:00:00.000Z'), 'BEST_OF');
    const quote = policy.quoteTicket(baseEvent, { eventDiscountBps: 0, earlyBirdAccess: false }, 1);
    expect(quote.tier).toMatch(/EARLY_BIRD/);
    resetClock();
  });
});
