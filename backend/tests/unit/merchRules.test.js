import { describe, expect, it } from 'vitest';
import { canTransitionProduct, isOrderable, offerProblems } from '../../src/modules/merchandise/domain/productRules.js';
import { adjustmentProblems, available, lowStockAction } from '../../src/modules/merchandise/domain/stockRules.js';
import { assertUnitQuote, lineProblems, parseItemsParam, pickupProblem, totals } from '../../src/modules/merchandise/domain/orderRules.js';
import { afterFailure, MAX_ATTEMPTS } from '../../src/modules/notifications/domain/retryPolicy.js';

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;

describe('product rules (LLD §2.8, OQ-20)', () => {
  it.each([
    ['DRAFT', 'ACTIVE', true], ['DRAFT', 'ARCHIVED', true], ['DRAFT', 'INACTIVE', false],
    ['ACTIVE', 'INACTIVE', true], ['ACTIVE', 'ARCHIVED', true], ['ACTIVE', 'DRAFT', false],
    ['INACTIVE', 'ACTIVE', true], ['INACTIVE', 'ARCHIVED', true],
    ['ARCHIVED', 'ACTIVE', false], ['ARCHIVED', 'INACTIVE', false],
  ])('%s → %s = %s', (from, to, ok) => expect(canTransitionProduct(from, to)).toBe(ok));

  it('offers: all three fields together, positive window, cheaper than the price', () => {
    expect(offerProblems({ pricePaise: 1000 })).toEqual([]);
    expect(offerProblems({ pricePaise: 1000, offerPricePaise: 800 })[0].path).toBe('offerPricePaise');
    const window = { offerStartsAt: '2026-11-01T00:00:00Z', offerEndsAt: '2026-11-10T00:00:00Z' };
    expect(offerProblems({ pricePaise: 1000, offerPricePaise: 800, ...window })).toEqual([]);
    expect(offerProblems({ pricePaise: 1000, offerPricePaise: 1000, ...window })[0].path).toBe('offerPricePaise');
    expect(offerProblems({ pricePaise: 1000, offerPricePaise: 800, offerStartsAt: window.offerEndsAt, offerEndsAt: window.offerStartsAt })[0].path).toBe('offerEndsAt');
  });

  it('orderable iff product ACTIVE and size active', () => {
    expect(isOrderable({ status: 'ACTIVE' }, { is_active: true })).toBe(true);
    expect(isOrderable({ status: 'ACTIVE' }, { is_active: false })).toBe(false);
    expect(isOrderable({ status: 'INACTIVE' }, { is_active: true })).toBe(false);
  });
});

describe('stock rules (LLD §2.8, §5.10)', () => {
  it('available = onHand − reserved; one alert per crossing', () => {
    expect(available({ stock_on_hand: 5, stock_reserved: 2 })).toBe(3);
    expect(lowStockAction({ stock_on_hand: 5, stock_reserved: 2, low_stock_threshold: 3 })).toBe('OPEN');
    expect(lowStockAction({ stock_on_hand: 6, stock_reserved: 2, low_stock_threshold: 3 })).toBe('RESOLVE');
  });

  it('adjustments: non-zero integers; RESTOCK positive', () => {
    expect(adjustmentProblems({ type: 'RESTOCK', quantity: 5 })).toEqual([]);
    expect(adjustmentProblems({ type: 'ADJUSTMENT', quantity: -2 })).toEqual([]);
    expect(adjustmentProblems({ type: 'RESTOCK', quantity: -1 })).toHaveLength(1);
    expect(adjustmentProblems({ type: 'ADJUSTMENT', quantity: 0 })).toHaveLength(1);
  });
});

describe('order rules (LLD §4.7, §5.9)', () => {
  it('parses items=variantId:qty lists', () => {
    expect(parseItemsParam(`${id(1)}:2,${id(2)}:1`)).toEqual([{ variantId: id(1), quantity: 2 }, { variantId: id(2), quantity: 1 }]);
    for (const bad of ['', 'x:1', `${id(1)}`, `${id(1)}:a`, `${id(1)}:100`]) expect(parseItemsParam(bad)).toBeNull();
  });

  it('TOO_MANY_ITEMS above 10 lines; duplicate sizes rejected', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 }));
    expect(lineProblems(many).code).toBe('TOO_MANY_ITEMS');
    expect(lineProblems(many.slice(0, 10))).toBeNull();
    expect(lineProblems([{ variantId: 'a', quantity: 1 }, { variantId: 'a', quantity: 2 }]).code).toBe('VALIDATION_FAILED');
  });

  it('totals: subtotal − discount = total; line = unit final × qty', () => {
    const t = totals([
      { variantId: 'a', productId: 'p', quantity: 2, unit: { listPricePaise: 50000, discountPaise: 5000, finalPricePaise: 45000, priceRule: 'MEMBER_DISCOUNT' } },
      { variantId: 'b', productId: 'q', quantity: 1, unit: { listPricePaise: 30000, discountPaise: 0, finalPricePaise: 30000, priceRule: 'LIST' } },
    ]);
    expect(t).toMatchObject({ subtotalPaise: 130000, discountPaise: 10000, totalPaise: 120000 });
    expect(t.lines[0].lineTotalPaise).toBe(90000);
  });

  it('rejects an inconsistent quote from PricingPolicy', () => {
    expect(() => assertUnitQuote({ listPricePaise: 100, discountPaise: 10, finalPricePaise: 95, priceRule: 'LIST' })).toThrow(/inconsistent/);
    expect(() => assertUnitQuote({ listPricePaise: 100.5, discountPaise: 0, finalPricePaise: 100.5, priceRule: 'LIST' })).toThrow(/inconsistent/);
    expect(() => assertUnitQuote({ listPricePaise: 100, discountPaise: 0, finalPricePaise: 100, priceRule: 'FREE' })).toThrow(/inconsistent/);
  });

  it('pickup: CONFIRMED ok, PICKED_UP → ALREADY_PICKED_UP, anything else → ORDER_NOT_READY', () => {
    expect(pickupProblem({ status: 'CONFIRMED' })).toBeNull();
    expect(pickupProblem({ status: 'PICKED_UP' })).toBe('ALREADY_PICKED_UP');
    for (const s of ['PENDING_PAYMENT', 'CANCELLED', 'EXPIRED']) expect(pickupProblem({ status: s })).toBe('ORDER_NOT_READY');
  });
});

describe('notification retry policy (LLD §2.7, OQ-17)', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  it('3 attempts: +1 min, +5 min, then FAILED; non-retryable fails at once', () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(afterFailure({ attempts: 1, retryable: true, now })).toEqual({ status: 'PENDING', nextAttemptAt: new Date('2026-11-01T00:01:00Z') });
    expect(afterFailure({ attempts: 2, retryable: true, now })).toEqual({ status: 'PENDING', nextAttemptAt: new Date('2026-11-01T00:05:00Z') });
    expect(afterFailure({ attempts: 3, retryable: true, now }).status).toBe('FAILED');
    expect(afterFailure({ attempts: 1, retryable: false, now }).status).toBe('FAILED');
  });
});
