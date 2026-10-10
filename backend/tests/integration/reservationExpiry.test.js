import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { placeOrder, variantRow } from '../helpers/merch.js';
import { makeClub, makeMembershipPayment, makeProduct, makeUser } from '../fixtures/factories.js';

// T-54 (orders half) — reservation-expiry job (LLD §7; OQ-09). Hold = RESERVATION_HOLD_MINUTES (15).

describe('reservation-expiry job', () => {
  let ctx;
  let club;
  let buyer;
  beforeAll(() => {
    ctx = buildTestContext();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await truncateAll(ctx.db);
    ctx.handlerCalls.length = 0;
    club = await makeClub(ctx.db);
    buyer = await ctx.signIn((await makeUser(ctx.db)).id);
  });
  const run = () => ctx.container.jobs.run('reservation-expiry', { asOf: ctx.clock.now() });

  it('an unpaid order is kept for 15 minutes, then EXPIRED with its stock released', async () => {
    const { variants } = await makeProduct(ctx.db, club, { pricePaise: 1000, variants: [{ size: 'M', stock: 5 }] });
    const placed = (await placeOrder(buyer, club.club.id, [{ variantId: variants.M.id, quantity: 2 }], 2000)).body.data;
    ctx.clock.advance({ minutes: 14 });
    expect((await run()).summary).toMatchObject({ due: 0 });
    expect((await variantRow(ctx.db, variants.M.id)).stock_reserved).toBe(2);

    ctx.clock.advance({ minutes: 1 });
    expect((await run()).summary).toEqual({ due: 1, expired: 1, skipped: 0, failed: 0 });
    expect(await ctx.db('payments').where({ id: placed.payment.id }).first()).toMatchObject({ status: 'EXPIRED', failure_reason: 'EXPIRED' });
    expect(await ctx.db('orders').where({ id: placed.order.id }).first()).toMatchObject({ status: 'EXPIRED', cancel_reason: 'EXPIRED' });
    expect(await variantRow(ctx.db, variants.M.id)).toMatchObject({ stock_on_hand: 5, stock_reserved: 0 });
    expect((await ctx.db('stock_movements').where({ type: 'RELEASE' }).first()).quantity).toBe(-2);
    expect((await run()).summary.due).toBe(0); // nothing left; re-running is harmless
  });

  it('paying after expiry is a no-op on a terminal payment (returned unchanged)', async () => {
    const { variants } = await makeProduct(ctx.db, club, { pricePaise: 1000 });
    const placed = (await placeOrder(buyer, club.club.id, [{ variantId: variants.M.id, quantity: 1 }], 1000)).body.data;
    ctx.clock.advance({ minutes: 16 });
    await run();
    const res = await buyer.post(`/api/v1/payments/${placed.payment.id}/simulate`).set('X-Requested-With', 'soms').set('Idempotency-Key', crypto.randomUUID()).send({ outcome: 'SUCCEEDED' });
    expect(res.body.data).toMatchObject({ status: 'EXPIRED', result: null });
    expect(await ctx.db('financial_transactions')).toHaveLength(0);
  });

  it('membership (Group 1 purpose) payments expire through their handler; AutoPay uses the 24 h timeout', async () => {
    const manual = await makeMembershipPayment(ctx);
    const autopay = await makeMembershipPayment(ctx, { method: 'SIMULATED_AUTOPAY' });
    await ctx.db('payments').where({ id: autopay.payment.id }).update({ status: 'PENDING' });
    ctx.clock.advance({ minutes: 16 });
    expect((await run()).summary).toMatchObject({ due: 1, expired: 1 });
    expect(ctx.handlerCalls).toEqual([{ purpose: 'MEMBERSHIP_JOIN', hook: 'onFailed', paymentId: manual.payment.id, reason: 'EXPIRED' }]);
    ctx.clock.advance({ hours: 23 });
    expect((await run()).summary.due).toBe(0);
    ctx.clock.advance({ hours: 1 });
    expect((await run()).summary).toMatchObject({ due: 1, expired: 1 });
    expect((await ctx.db('payments').where({ id: autopay.payment.id }).first()).status).toBe('EXPIRED');
  });

  it('one failing payment does not stop the others (own transaction each)', async () => {
    const failing = buildTestContext({ handlerOptions: { failOn: 'onFailed' } });
    try {
      const { variants } = await makeProduct(failing.db, club, { pricePaise: 1000 });
      await makeMembershipPayment(failing);
      const placed = (await placeOrder(await failing.signIn((await makeUser(failing.db)).id), club.club.id, [{ variantId: variants.M.id, quantity: 1 }], 1000)).body.data;
      failing.clock.advance({ minutes: 16 });
      const result = await failing.container.jobs.run('reservation-expiry', { asOf: failing.clock.now() });
      expect(result.summary).toEqual({ due: 2, expired: 1, skipped: 0, failed: 1 });
      expect((await failing.db('orders').where({ id: placed.order.id }).first()).status).toBe('EXPIRED');
    } finally {
      await failing.close();
    }
  });
});
