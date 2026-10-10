import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { pay, placeOrder, variantRow } from '../helpers/merch.js';
import { makeClub, makeProduct, makeUser } from '../fixtures/factories.js';

// TC-MER-02 — overselling under concurrency (LLD §3.2): conditional reserve, CHECK backstop,
// ascending-id locking for multi-line orders. Real PostgreSQL, parallel connections.

describe('merchandise under concurrency', () => {
  let ctx;
  let club;
  beforeAll(() => {
    ctx = buildTestContext();
  });
  afterAll(async () => {
    const recon = await ctx.container.finance.summary.reconcile(club.club.id);
    await ctx.close();
    expect(recon.ok).toBe(true);
  });
  beforeEach(async () => {
    await truncateAll(ctx.db);
    club = await makeClub(ctx.db);
  });

  const buyers = (n) => Promise.all(Array.from({ length: n }, async () => ctx.signIn((await makeUser(ctx.db)).id)));

  it('TC-MER-02: stock 5, 30 parallel orders of 1 → exactly 5 reserved, 25 OUT_OF_STOCK, available never < 0', async () => {
    const { variants } = await makeProduct(ctx.db, club, { pricePaise: 1000, variants: [{ size: 'M', stock: 5 }] });
    const agents = await buyers(30);
    const res = await Promise.all(agents.map((a) => placeOrder(a, club.club.id, [{ variantId: variants.M.id, quantity: 1 }], 1000)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(5);
    const rejected = res.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(25);
    expect(rejected.every((r) => r.body.error.code === 'OUT_OF_STOCK')).toBe(true);
    expect(await variantRow(ctx.db, variants.M.id)).toMatchObject({ stock_on_hand: 5, stock_reserved: 5 });
    expect(await ctx.db('orders')).toHaveLength(5);
    expect(await ctx.db('stock_movements').where({ type: 'RESERVE' })).toHaveLength(5);
  });

  it('then 5 parallel payments sell exactly the stock: onHand 0, reserved 0, 5 ledger rows', async () => {
    const { variants } = await makeProduct(ctx.db, club, { pricePaise: 1000, variants: [{ size: 'M', stock: 5 }] });
    const agents = await buyers(5);
    const placed = await Promise.all(agents.map((a) => placeOrder(a, club.club.id, [{ variantId: variants.M.id, quantity: 1 }], 1000)));
    await Promise.all(placed.map((p, i) => pay(agents[i], p.body.data.payment.id)));
    expect(await variantRow(ctx.db, variants.M.id)).toMatchObject({ stock_on_hand: 0, stock_reserved: 0 });
    expect(await ctx.db('financial_transactions').where({ category: 'MERCH_SALE' })).toHaveLength(5);
    expect(await ctx.db('orders').where({ status: 'CONFIRMED' })).toHaveLength(5);
  });

  it('multi-line orders listing sizes in opposite orders do not deadlock', async () => {
    const { variants } = await makeProduct(ctx.db, club, { pricePaise: 1000, variants: [{ size: 'A', stock: 100 }, { size: 'B', stock: 100 }] });
    const agents = await buyers(20);
    const res = await Promise.all(
      agents.map((a, i) => {
        const lines = [{ variantId: variants.A.id, quantity: 1 }, { variantId: variants.B.id, quantity: 1 }];
        return placeOrder(a, club.club.id, i % 2 ? lines.reverse() : lines, 2000);
      }),
    );
    expect(res.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect((await variantRow(ctx.db, variants.A.id)).stock_reserved).toBe(20);
    expect((await variantRow(ctx.db, variants.B.id)).stock_reserved).toBe(20);
  });

  it('payment success racing the expiry job: exactly one outcome, stock consistent', async () => {
    const { variants } = await makeProduct(ctx.db, club, { pricePaise: 1000, variants: [{ size: 'M', stock: 3 }] });
    const [agent] = await buyers(1);
    const placed = (await placeOrder(agent, club.club.id, [{ variantId: variants.M.id, quantity: 2 }], 2000)).body.data;
    ctx.clock.advance({ minutes: 16 });
    const [paid] = await Promise.all([pay(agent, placed.payment.id), ctx.container.jobs.run('reservation-expiry', { asOf: ctx.clock.now() })]);
    const v = await variantRow(ctx.db, variants.M.id);
    const order = await ctx.db('orders').where({ id: placed.order.id }).first();
    if (paid.body.data.status === 'SUCCEEDED') {
      expect(order.status).toBe('CONFIRMED');
      expect(v).toMatchObject({ stock_on_hand: 1, stock_reserved: 0 });
    } else {
      expect(order.status).toBe('EXPIRED');
      expect(v).toMatchObject({ stock_on_hand: 3, stock_reserved: 0 });
    }
  });
});
