import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, idemKey } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { reconcilePayments } from '../helpers/reconciliation.js';
import { makeMembershipPayment } from '../fixtures/factories.js';

// TC-PAY-01 — concurrent settlement runs the handler once and writes one ledger row.
// Real PostgreSQL; every settle runs in its own transaction on its own pool connection.
// Must pass 10 consecutive runs (see `npm run test:concurrency` loop in the report).

const PARALLEL = 10;

describe('TC-PAY-01 concurrent settle', () => {
  let ctx;
  beforeAll(() => {
    ctx = buildTestContext({ handlerOptions: { delayMs: 50 } });
  });
  afterAll(async () => {
    const recon = await reconcilePayments(ctx.db);
    await ctx.close();
    expect(recon).toEqual({ ok: true, mismatches: [], succeededWithoutLedger: 0, ledgerWithoutSucceeded: 0 });
  });
  beforeEach(async () => {
    await truncateAll(ctx.db);
    ctx.handlerCalls.length = 0;
  });

  const settleInOwnTxn = (paymentId, outcome) =>
    ctx.container.withTransaction((trx) => ctx.container.finance.payments.settle(paymentId, outcome, trx));
  const ledgerRows = (paymentId) => ctx.db('financial_transactions').where({ source_type: 'PAYMENT', source_id: paymentId });

  it(`${PARALLEL} parallel settle(SUCCEEDED) → 1 handler run, 1 ledger row`, async () => {
    const { payment } = await makeMembershipPayment(ctx);
    const results = await Promise.all(Array.from({ length: PARALLEL }, () => settleInOwnTxn(payment.id, 'SUCCEEDED')));

    expect(results.filter((r) => r.settled)).toHaveLength(1);
    expect(results.every((r) => r.payment.status === 'SUCCEEDED')).toBe(true);
    expect(ctx.handlerCalls).toHaveLength(1);
    expect(await ledgerRows(payment.id)).toHaveLength(1);
  });

  it(`${PARALLEL} parallel simulate(SUCCEEDED) API calls with different keys → all 200, 1 handler run, 1 ledger row`, async () => {
    const { payment, user } = await makeMembershipPayment(ctx);
    const agents = await Promise.all(Array.from({ length: PARALLEL }, () => ctx.signIn(user.id)));
    const responses = await Promise.all(
      agents.map((agent) =>
        agent
          .post(`/api/v1/payments/${payment.id}/simulate`)
          .set('X-Requested-With', 'soms')
          .set('Idempotency-Key', idemKey())
          .send({ outcome: 'SUCCEEDED' }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(PARALLEL).fill(200));
    expect(responses.every((r) => r.body.data.status === 'SUCCEEDED')).toBe(true);
    expect(responses.filter((r) => r.body.data.result !== null)).toHaveLength(1);
    expect(ctx.handlerCalls).toHaveLength(1);
    expect(await ledgerRows(payment.id)).toHaveLength(1);
  });

  it('racing SUCCEEDED and FAILED → exactly one outcome wins; ledger matches the winner', async () => {
    const { payment } = await makeMembershipPayment(ctx);
    const outcomes = Array.from({ length: PARALLEL }, (_, i) => (i % 2 ? 'FAILED' : 'SUCCEEDED'));
    const results = await Promise.all(outcomes.map((o) => settleInOwnTxn(payment.id, o)));

    const winners = results.filter((r) => r.settled);
    expect(winners).toHaveLength(1);
    const final = (await ctx.db('payments').where({ id: payment.id }).first()).status;
    expect(winners[0].payment.status).toBe(final);
    expect(results.every((r) => r.payment.status === final)).toBe(true);
    expect(ctx.handlerCalls).toHaveLength(1);
    expect(await ledgerRows(payment.id)).toHaveLength(final === 'SUCCEEDED' ? 1 : 0);
  });

  it(`${PARALLEL} parallel requests with the SAME Idempotency-Key → one execution`, async () => {
    const { payment, user } = await makeMembershipPayment(ctx);
    const agent = await ctx.signIn(user.id);
    const key = idemKey();
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        agent
          .post(`/api/v1/payments/${payment.id}/simulate`)
          .set('X-Requested-With', 'soms')
          .set('Idempotency-Key', key)
          .send({ outcome: 'SUCCEEDED' }),
      ),
    );
    for (const r of responses) {
      if (r.status === 409) expect(r.body.error.code).toBe('REQUEST_IN_PROGRESS');
      else expect(r.status).toBe(200);
    }
    const ok = responses.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.filter((r) => r.headers['idempotent-replayed'] !== 'true')).toHaveLength(1);
    expect(ctx.handlerCalls).toHaveLength(1);
    expect(await ledgerRows(payment.id)).toHaveLength(1);
  });

  it('many payments settled concurrently (3 racers each) reconcile: ledger = SUCCEEDED payments', async () => {
    const created = [];
    for (let i = 0; i < 8; i += 1) created.push((await makeMembershipPayment(ctx)).payment);
    const jobs = created.flatMap((p, i) => {
      const outcome = i % 3 === 0 ? 'FAILED' : 'SUCCEEDED';
      return [settleInOwnTxn(p.id, outcome), settleInOwnTxn(p.id, outcome), settleInOwnTxn(p.id, 'EXPIRED')];
    });
    await Promise.all(jobs);
    expect(ctx.handlerCalls).toHaveLength(created.length);
    const recon = await reconcilePayments(ctx.db);
    expect(recon.ok).toBe(true);
  });
});
