import { afterAll, beforeAll, describe, it } from 'vitest';
import { buildTestContext, idemKey } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { approve, submitExpense } from '../helpers/finance.js';
import { makeFundraiser } from '../fixtures/factories.js';
import { expectStatus, makeCast, matrixRows } from '../helpers/authzMatrix.js';

// TC-AZ-01 rows for the finance endpoints of T-80…T-83 (each role, same and other club).
// State-changing rows get a fresh resource per row (setup), so outcomes don't depend on order.

describe('TC-AZ-01 — expenses, income, budgets, finance reads', () => {
  let ctx;
  let cast;
  let fundraiser;
  let budget;
  let volClaim; // a SUBMITTED reimbursement by VOL_A, used by read rows
  const H = { 'X-Requested-With': 'soms' };

  beforeAll(async () => {
    ctx = buildTestContext();
    await truncateAll(ctx.db);
    cast = await makeCast(ctx);
    fundraiser = await makeFundraiser(ctx.db, cast.a);
    volClaim = (await submitExpense(cast.agents.VOL_A, cast.a.club.id)).body.data;
    budget = (await cast.agents.TR_A.post(`/api/v1/clubs/${cast.a.club.id}/budgets`).set(H).send({ name: 'B', periodStart: '2026-07-01', periodEnd: '2026-12-31', amountPaise: 1000 })).body.data;
  });
  afterAll(() => ctx.close());

  const A = () => cast.a.club.id;
  const freshClaim = async () => (await submitExpense(cast.agents.VOL_A, A())).body.data.id;
  const approvedClaim = async () => {
    const id = await freshClaim();
    await approve(cast.agents.TR_A, id);
    return id;
  };
  let nextYear = 2030;

  const endpoints = {
    'POST /clubs/:A/expenses REIMBURSEMENT': { run: (ag) => submitExpense(ag, A()) },
    'POST /clubs/:A/expenses DIRECT': { run: (ag) => submitExpense(ag, A(), { kind: 'DIRECT' }) },
    'GET /clubs/:A/expenses': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/expenses`) },
    'GET /me/expenses': { run: (ag) => ag.get('/api/v1/me/expenses') },
    'GET /expenses/:id (VOL_A claim)': { run: (ag) => ag.get(`/api/v1/expenses/${volClaim.id}`) },
    'GET /expenses/:id/receipt (VOL_A claim)': { run: (ag) => ag.get(`/api/v1/expenses/${volClaim.id}/receipt`) },
    'POST /expenses/:id/approve (VOL_A claim)': { setup: freshClaim, run: (ag, id) => approve(ag, id) },
    'POST /expenses/:id/reject (VOL_A claim)': {
      setup: freshClaim,
      run: (ag, id) => ag.post(`/api/v1/expenses/${id}/reject`).set(H).set('Idempotency-Key', idemKey()).send({ note: 'no' }),
    },
    'POST /expenses/:id/mark-paid (VOL_A payee)': {
      setup: approvedClaim,
      run: (ag, id) => ag.post(`/api/v1/expenses/${id}/mark-paid`).set(H).set('Idempotency-Key', idemKey()).send({ payoutReference: 'R', paidOn: '2026-10-30' }),
    },
    'POST /clubs/:A/income-entries': {
      run: (ag) =>
        ag.post(`/api/v1/clubs/${A()}/income-entries`).set(H).set('Idempotency-Key', idemKey()).send({ fundraiserId: fundraiser.id, amountPaise: 100, receivedOn: '2026-10-30', description: 'x' }),
    },
    'GET /clubs/:A/budgets': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/budgets`) },
    'POST /clubs/:A/budgets': {
      run: (ag) => {
        nextYear += 1;
        return ag.post(`/api/v1/clubs/${A()}/budgets`).set(H).send({ name: 'Y', periodStart: `${nextYear}-01-01`, periodEnd: `${nextYear}-01-31`, amountPaise: 1 });
      },
    },
    'PATCH /budgets/:id': { run: (ag) => ag.patch(`/api/v1/budgets/${budget.id}`).set(H).send({ notes: 'n' }) },
    'GET /clubs/:A/finance/summary': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/finance/summary`) },
    'GET /clubs/:A/transactions': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/transactions`) },
    'GET /clubs/:A/finance/reconciliation': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/finance/reconciliation`) },
  };

  const chTr = (ok) => ({ ANON: 401, AUTH_OTHER: 404, VOL_A: 403, TR_A: ok, CH_A: ok, ORG_A: 403, TR_B: 404, CH_B: 404 });
  const trOnly = (ok) => ({ ANON: 401, AUTH_OTHER: 404, VOL_A: 403, TR_A: ok, CH_A: 403, ORG_A: 403, TR_B: 404, CH_B: 404 });
  const team = (ok) => ({ ANON: 401, AUTH_OTHER: 404, VOL_A: ok, TR_A: ok, CH_A: ok, ORG_A: ok, TR_B: 404, CH_B: 404 });
  const matrix = {
    'POST /clubs/:A/expenses REIMBURSEMENT': team(201),
    'POST /clubs/:A/expenses DIRECT': trOnly(201),
    'GET /clubs/:A/expenses': chTr(200),
    'GET /me/expenses': { ANON: 401, AUTH_OTHER: 200, VOL_A: 200, TR_A: 200, CH_A: 200, ORG_A: 200, TR_B: 200, CH_B: 200 },
    'GET /expenses/:id (VOL_A claim)': { ...chTr(200), VOL_A: 200 },
    'GET /expenses/:id/receipt (VOL_A claim)': { ...chTr(200), VOL_A: 200 },
    // volunteer's own claim: VOL_A is FORBIDDEN by role; a club head alone may not review volunteer claims
    'POST /expenses/:id/approve (VOL_A claim)': trOnly(200),
    'POST /expenses/:id/reject (VOL_A claim)': trOnly(200),
    'POST /expenses/:id/mark-paid (VOL_A payee)': trOnly(200),
    'POST /clubs/:A/income-entries': trOnly(201),
    'GET /clubs/:A/budgets': chTr(200),
    'POST /clubs/:A/budgets': trOnly(201),
    'PATCH /budgets/:id': trOnly(200),
    // OQ-38 APPROVED: the aggregate summary is the only read where an event organizer counts as TEAM.
    'GET /clubs/:A/finance/summary': team(200),
    'GET /clubs/:A/transactions': chTr(200),
    'GET /clubs/:A/finance/reconciliation': chTr(200),
  };

  it.each(matrixRows(matrix))('%s as %s → %i', async (endpoint, actor, status) => {
    const e = endpoints[endpoint];
    const id = e.setup ? await e.setup() : undefined;
    await expectStatus(await e.run(cast.agents[actor], id), status);
  });
});
