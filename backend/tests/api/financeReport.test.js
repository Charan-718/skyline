import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestContext, idemKey } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { approve, markPaid, submitExpense } from '../helpers/finance.js';
import { expectStatus, makeCast, matrixRows } from '../helpers/authzMatrix.js';
import { makeFundraiser, makeMembershipPayment } from '../fixtures/factories.js';

// Step 4 task 1 — GET /clubs/:clubId/reports/finance (LLD §4.10; OQ-52 APPROVED).
//
// Fixture for club A (clock 2026-11-01 10:00 IST), expected values by hand:
//   IN   MEMBERSHIP_DUES   50000 (1 entry, 2026-11-01)
//        FUNDRAISER_INCOME 15000 (2026-10-31) + 5000 (2026-09-15) = 20000 (2 entries)
//   OUT  DIRECT_EXPENSE    12000 (1 entry, 2026-10-29)
//        REIMBURSEMENT_PAYOUT 25000 (1 entry, paid 2026-10-30)
//   approved unpaid 8000; pending review 4000; club B has a DIRECT 99999 that must not appear.
//   all-time: income 70000, expenses 37000, available 33000, projected 25000
//   monthly: 2026-09 in 5000 out 0 net 5000; 2026-10 in 15000 out 37000 net −22000;
//            2026-11 in 50000 out 0 net 50000

const H = { 'X-Requested-With': 'soms' };

describe('finance report (LLD §4.10)', () => {
  let ctx;
  let cast;
  beforeAll(async () => {
    ctx = buildTestContext();
    await truncateAll(ctx.db);
    cast = await makeCast(ctx);
    const { a, b, agents } = cast;
    const dues = await makeMembershipPayment(ctx, { club: a, amountPaise: 50000 });
    await ctx.container.withTransaction((trx) => ctx.container.finance.payments.settle(dues.payment.id, 'SUCCEEDED', trx));
    const f = await makeFundraiser(ctx.db, a);
    for (const [amountPaise, receivedOn] of [[15000, '2026-10-31'], [5000, '2026-09-15']]) {
      await agents.TR_A.post(`/api/v1/clubs/${a.club.id}/income-entries`).set(H).set('Idempotency-Key', idemKey())
        .send({ fundraiserId: f.id, amountPaise, receivedOn, description: 'cash' }).expect(201);
    }
    await submitExpense(agents.TR_A, a.club.id, { kind: 'DIRECT', amountPaise: '12000', incurredOn: '2026-10-29' }).expect(201);
    const payout = (await submitExpense(agents.VOL_A, a.club.id, { amountPaise: '25000', incurredOn: '2026-10-10' })).body.data;
    await approve(agents.TR_A, payout.id).expect(200);
    await markPaid(agents.TR_A, payout.id, { payoutReference: 'U1', paidOn: '2026-10-30' }).expect(200);
    const committed = (await submitExpense(agents.VOL_A, a.club.id, { amountPaise: '8000', incurredOn: '2026-10-20' })).body.data;
    await approve(agents.TR_A, committed.id).expect(200);
    await submitExpense(agents.VOL_A, a.club.id, { amountPaise: '4000', incurredOn: '2026-10-21' }).expect(201);
    await submitExpense(agents.TR_B, b.club.id, { kind: 'DIRECT', amountPaise: '99999' }).expect(201);
  });
  afterAll(() => ctx.close());

  it('all-time report: summary metrics, monthly series with net, category breakdown with entry counts', async () => {
    const res = await cast.agents.TR_A.get(`/api/v1/clubs/${cast.a.club.id}/reports/finance`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      currency: 'INR',
      period: { from: null, to: null },
      totalIncomePaise: 70000,
      incomeByCategory: { MEMBERSHIP_DUES: 50000, MEMBERSHIP_RENEWAL: 0, TICKET_SALE: 0, MERCH_SALE: 0, FUNDRAISER_INCOME: 20000 },
      totalPaidExpensesPaise: 37000,
      availableBalancePaise: 33000,
      approvedUnpaidTotalPaise: 8000,
      pendingReviewTotalPaise: 4000,
      projectedBalancePaise: 25000,
      activeBudget: null,
      monthly: [
        { month: '2026-09', inPaise: 5000, outPaise: 0, netPaise: 5000 },
        { month: '2026-10', inPaise: 15000, outPaise: 37000, netPaise: -22000 },
        { month: '2026-11', inPaise: 50000, outPaise: 0, netPaise: 50000 },
      ],
      categoryBreakdown: {
        IN: [
          { category: 'MEMBERSHIP_DUES', totalPaise: 50000, entries: 1 },
          { category: 'MEMBERSHIP_RENEWAL', totalPaise: 0, entries: 0 },
          { category: 'TICKET_SALE', totalPaise: 0, entries: 0 },
          { category: 'MERCH_SALE', totalPaise: 0, entries: 0 },
          { category: 'FUNDRAISER_INCOME', totalPaise: 20000, entries: 2 },
        ],
        OUT: [
          { category: 'REIMBURSEMENT_PAYOUT', totalPaise: 25000, entries: 1 },
          { category: 'DIRECT_EXPENSE', totalPaise: 12000, entries: 1 },
        ],
      },
    });
  });

  it('period report: October only (balances stay all-time)', async () => {
    const res = await cast.agents.CH_A.get(`/api/v1/clubs/${cast.a.club.id}/reports/finance?from=2026-10-01&to=2026-10-31`);
    expect(res.body.data).toMatchObject({
      period: { from: '2026-10-01', to: '2026-10-31' },
      totalIncomePaise: 15000,
      totalPaidExpensesPaise: 37000,
      availableBalancePaise: 33000,
      monthly: [{ month: '2026-10', inPaise: 15000, outPaise: 37000, netPaise: -22000 }],
    });
    expect(res.body.data.categoryBreakdown.IN.find((c) => c.category === 'FUNDRAISER_INCOME')).toEqual({ category: 'FUNDRAISER_INCOME', totalPaise: 15000, entries: 1 });
    expect(res.body.data.categoryBreakdown.IN.find((c) => c.category === 'MEMBERSHIP_DUES').entries).toBe(0);
  });

  it('report agrees with GET /finance/summary for the same period', async () => {
    const report = (await cast.agents.TR_A.get(`/api/v1/clubs/${cast.a.club.id}/reports/finance?from=2026-09-01`)).body.data;
    const summary = (await cast.agents.TR_A.get(`/api/v1/clubs/${cast.a.club.id}/finance/summary?from=2026-09-01`)).body.data;
    for (const key of ['totalIncomePaise', 'totalPaidExpensesPaise', 'availableBalancePaise', 'projectedBalancePaise', 'incomeByCategory']) {
      expect(report[key]).toEqual(summary[key]);
    }
  });

  it('validation: bad dates or from after to → 400', async () => {
    for (const q of ['from=2026-13-01', 'from=2026-11-02&to=2026-11-01', 'bogus=1']) {
      expect((await cast.agents.TR_A.get(`/api/v1/clubs/${cast.a.club.id}/reports/finance?${q}`)).status).toBe(400);
    }
  });

  const matrix = { report: { ANON: 401, AUTH_OTHER: 404, VOL_A: 403, TR_A: 200, CH_A: 200, ORG_A: 403, TR_B: 404, CH_B: 404 } };
  it.each(matrixRows(matrix))('TC-AZ-01 %s as %s → %i', async (_e, actor, status) => {
    await expectStatus(await cast.agents[actor].get(`/api/v1/clubs/${cast.a.club.id}/reports/finance`), status);
  });
});
