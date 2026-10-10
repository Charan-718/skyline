import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { makeClub, makeMembershipPayment, makePendingTerm, makePlan, makeUser } from '../fixtures/factories.js';

// payments.create / payments.settle (LLD §2.10, §5) against real PostgreSQL.

describe('payments service', () => {
  let ctx;
  let payments;
  beforeAll(() => {
    ctx = buildTestContext();
    payments = ctx.container.finance.payments;
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await truncateAll(ctx.db);
    ctx.handlerCalls.length = 0;
  });

  const settle = (id, outcome, opts) => ctx.container.withTransaction((trx) => payments.settle(id, outcome, trx, opts));
  const ledgerCount = async () => Number((await ctx.db('financial_transactions').count({ n: '*' }).first()).n);

  it('create: INITIATED, simulated, INR, SIM- reference, amount from the server', async () => {
    const { payment, plan } = await makeMembershipPayment(ctx);
    expect(payment).toMatchObject({
      status: 'INITIATED',
      is_simulated: true,
      currency: 'INR',
      method: 'SIMULATED',
      amount_paise: plan.fee_paise,
      settled_at: null,
    });
    expect(payment.reference).toMatch(/^SIM-[0-9A-Z]{12}$/);
  });

  it('create: a second live payment for the same target is PAYMENT_ALREADY_PENDING', async () => {
    const { payment, club, user } = await makeMembershipPayment(ctx);
    const again = ctx.container.withTransaction((trx) =>
      payments.create(trx, {
        clubId: club.id,
        userId: user.id,
        purpose: 'MEMBERSHIP_JOIN',
        membershipTermId: payment.membership_term_id,
        amountPaise: 50000,
      }),
    );
    await expect(again).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_PENDING' });
  });

  it('create: a FAILED payment frees the target for a new attempt', async () => {
    const { payment, club, user } = await makeMembershipPayment(ctx);
    await settle(payment.id, 'FAILED');
    const retry = await ctx.container.withTransaction((trx) =>
      payments.create(trx, { clubId: club.id, userId: user.id, purpose: 'MEMBERSHIP_JOIN', membershipTermId: payment.membership_term_id, amountPaise: 50000 }),
    );
    expect(retry.status).toBe('INITIATED');
  });

  it('create: rejects bad input before touching the database', async () => {
    const { club, user, term } = await makeMembershipPayment(ctx);
    const create = (input) => ctx.container.withTransaction((trx) => payments.create(trx, input));
    const base = { clubId: club.id, userId: user.id, purpose: 'MEMBERSHIP_JOIN', membershipTermId: term.id, amountPaise: 100 };
    await expect(create({ ...base, amountPaise: 99.5 })).rejects.toThrow(/amountPaise/);
    await expect(create({ ...base, amountPaise: 0 })).rejects.toThrow(/amountPaise/);
    await expect(create({ ...base, purpose: 'EVENT_TICKET' })).rejects.toThrow(/bookingId/);
    await expect(payments.create(null, base)).rejects.toThrow(/transaction/);
  });

  it('is_simulated is always true: the CHECK rejects false, and the target CHECK rejects zero/two targets', async () => {
    const { club, user, term } = await makeMembershipPayment(ctx);
    const insert = (row) =>
      ctx.db('payments').insert({
        club_id: club.id,
        user_id: user.id,
        purpose: 'MEMBERSHIP_JOIN',
        membership_term_id: term.id,
        amount_paise: 100,
        method: 'SIMULATED',
        status: 'FAILED',
        reference: `SIM-${Math.random().toString(36).slice(2, 14)}`,
        ...row,
      });
    await expect(insert({ is_simulated: false })).rejects.toThrow(/payments_is_simulated_check/);
    await expect(insert({ membership_term_id: null })).rejects.toThrow(/payments_one_target_chk/);
    await expect(insert({ amount_paise: 0 })).rejects.toThrow(/payments_amount_paise_check/);
    await expect(insert({ currency: 'USD' })).rejects.toThrow(/payments_currency_check/);
  });

  it('settle SUCCEEDED: conditional update, handler once, one ledger row at settled_at', async () => {
    const { payment } = await makeMembershipPayment(ctx);
    const out = await settle(payment.id, 'SUCCEEDED');
    expect(out.settled).toBe(true);
    expect(out.result).toEqual({ handled: 'MEMBERSHIP_JOIN' });
    expect(out.payment).toMatchObject({ status: 'SUCCEEDED', failure_reason: null });
    expect(out.payment.settled_at.toISOString()).toBe(ctx.clock.now().toISOString());
    expect(ctx.handlerCalls).toEqual([{ purpose: 'MEMBERSHIP_JOIN', hook: 'onSucceeded', paymentId: payment.id }]);
    const row = await ctx.db('financial_transactions').where({ payment_id: payment.id }).first();
    expect(row).toMatchObject({
      direction: 'IN',
      category: 'MEMBERSHIP_DUES',
      amount_paise: payment.amount_paise,
      source_type: 'PAYMENT',
      source_id: payment.id,
      payer_user_id: payment.user_id,
      recorded_by: null,
    });
    expect(row.occurred_at.toISOString()).toBe(out.payment.settled_at.toISOString());
  });

  it('settle on a terminal payment: no change, no handler, no ledger row', async () => {
    const { payment } = await makeMembershipPayment(ctx);
    await settle(payment.id, 'SUCCEEDED');
    const again = await settle(payment.id, 'FAILED', { reason: 'USER_CANCELLED' });
    expect(again).toMatchObject({ settled: false, result: null, payment: { status: 'SUCCEEDED' } });
    expect(ctx.handlerCalls).toHaveLength(1);
    expect(await ledgerCount()).toBe(1);
  });

  it('settle FAILED/EXPIRED: failure_reason stored, onFailed gets the reason, no ledger row', async () => {
    const a = await makeMembershipPayment(ctx);
    const b = await makeMembershipPayment(ctx);
    const failed = await settle(a.payment.id, 'FAILED', { reason: 'USER_CANCELLED' });
    const expired = await settle(b.payment.id, 'EXPIRED');
    expect(failed.payment).toMatchObject({ status: 'FAILED', failure_reason: 'USER_CANCELLED' });
    expect(expired.payment).toMatchObject({ status: 'EXPIRED', failure_reason: 'EXPIRED' });
    expect(ctx.handlerCalls.map((c) => [c.hook, c.reason])).toEqual([
      ['onFailed', 'USER_CANCELLED'],
      ['onFailed', 'EXPIRED'],
    ]);
    expect(await ledgerCount()).toBe(0);
  });

  it('settle unknown payment is NOT_FOUND; unknown outcome is a programming error', async () => {
    await expect(settle('00000000-0000-4000-8000-000000000000', 'SUCCEEDED')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { payment } = await makeMembershipPayment(ctx);
    await expect(settle(payment.id, 'PENDING')).rejects.toThrow(TypeError);
  });

  it('a handler failure rolls back the status change and the ledger insert', async () => {
    const failing = buildTestContext({ handlerOptions: { failOn: 'onSucceeded' } });
    try {
      const { payment } = await makeMembershipPayment(failing);
      await expect(
        failing.container.withTransaction((trx) => failing.container.finance.payments.settle(payment.id, 'SUCCEEDED', trx)),
      ).rejects.toThrow(/handler failure/);
      expect((await failing.db('payments').where({ id: payment.id }).first()).status).toBe('INITIATED');
      expect(await failing.db('financial_transactions').where({ payment_id: payment.id }).first()).toBeUndefined();
    } finally {
      await failing.close();
    }
  });

  it('settle with no registered handler for the purpose fails and changes nothing', async () => {
    const bare = buildTestContext({ paymentHandlers: [] });
    try {
      const { payment } = await makeMembershipPayment(bare);
      await expect(
        bare.container.withTransaction((trx) => bare.container.finance.payments.settle(payment.id, 'SUCCEEDED', trx)),
      ).rejects.toThrow(/no payment handler registered for MEMBERSHIP_JOIN/);
      expect((await bare.db('payments').where({ id: payment.id }).first()).status).toBe('INITIATED');
    } finally {
      await bare.close();
    }
  });

  it('default container wiring: the TODO(group1) membership stub is registered and records the call', async () => {
    const { createContainer } = await import('../../src/container.js');
    const { createLogger } = await import('../../src/shared/logger.js');
    const container = createContainer({ config: ctx.config, db: ctx.db, logger: createLogger({ level: 'silent' }), clock: ctx.clock });
    try {
      const clubData = await makeClub(ctx.db);
      const user = await makeUser(ctx.db);
      const plan = await makePlan(ctx.db, clubData.club, clubData.head);
      const { term } = await makePendingTerm(ctx.db, { club: clubData.club, user, plan });
      const payment = await container.withTransaction((trx) =>
        container.finance.payments.create(trx, { clubId: clubData.club.id, userId: user.id, purpose: 'MEMBERSHIP_JOIN', membershipTermId: term.id, amountPaise: plan.fee_paise }),
      );
      await container.withTransaction((trx) => container.finance.payments.settle(payment.id, 'SUCCEEDED', trx));
      expect(container.membershipHandlerCalls).toEqual([{ purpose: 'MEMBERSHIP_JOIN', hook: 'onSucceeded', paymentId: payment.id }]);
    } finally {
      await container.sessionPool.end();
    }
  });
});
