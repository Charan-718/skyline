import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { approve, ledgerOut, markPaid, submitExpense } from '../helpers/finance.js';
import { makeClub, makeUser } from '../fixtures/factories.js';

// Expense transitions under concurrency (Step 3 §C): 10 parallel connections.
//   double mark-paid → exactly one ledger OUT row; double approve → one transition.

const PARALLEL = 10;

describe('expense lifecycle under concurrency', () => {
  let ctx;
  let club;
  let volunteer;
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
    volunteer = await makeUser(ctx.db);
    club = await makeClub(ctx.db, { volunteers: [volunteer] });
  });

  const claim = async () => (await submitExpense(await ctx.signIn(volunteer.id), club.club.id, { amountPaise: '25000', incurredOn: '2026-10-20' })).body.data.id;
  const treasurers = () => Promise.all(Array.from({ length: PARALLEL }, () => ctx.signIn(club.treasurer.id)));

  it(`${PARALLEL} parallel mark-paid (different keys) → one 200, the rest CONFLICT_STATE, one ledger OUT row`, async () => {
    const id = await claim();
    await approve(await ctx.signIn(club.treasurer.id), id);
    const responses = await Promise.all((await treasurers()).map((ag) => markPaid(ag, id)));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    const conflicts = responses.filter((r) => r.status === 409);
    expect(conflicts).toHaveLength(PARALLEL - 1);
    for (const r of conflicts) expect(r.body.error).toMatchObject({ code: 'CONFLICT_STATE', details: { currentStatus: 'PAID' } });
    expect(await ledgerOut(ctx.db, id)).toHaveLength(1);
    expect(await ctx.db('audit_logs').where({ action: 'EXPENSE_PAID', entity_id: id })).toHaveLength(1);
  });

  it(`${PARALLEL} parallel approve → one transition, the rest CONFLICT_STATE`, async () => {
    const id = await claim();
    const responses = await Promise.all((await treasurers()).map((ag) => approve(ag, id)));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409 && r.body.error.code === 'CONFLICT_STATE')).toHaveLength(PARALLEL - 1);
    expect(await ctx.db('audit_logs').where({ action: 'EXPENSE_APPROVED', entity_id: id })).toHaveLength(1);
    expect(await ledgerOut(ctx.db, id)).toHaveLength(0);
  });

  it('racing approve and reject → exactly one decision wins', async () => {
    const id = await claim();
    const agents = await treasurers();
    const responses = await Promise.all(
      agents.map((ag, i) =>
        i % 2 ? approve(ag, id) : ag.post(`/api/v1/expenses/${id}/reject`).set('X-Requested-With', 'soms').set('Idempotency-Key', crypto.randomUUID()).send({ note: 'n' }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    const final = (await ctx.db('expenses').where({ id }).first()).status;
    expect(['APPROVED', 'REJECTED']).toContain(final);
    expect(await ctx.db('audit_logs').whereIn('action', ['EXPENSE_APPROVED', 'EXPENSE_REJECTED']).where({ entity_id: id })).toHaveLength(1);
  });

  it('service level: 10 parallel markPaid transactions on separate connections → one ledger row', async () => {
    const id = await claim();
    await approve(await ctx.signIn(club.treasurer.id), id);
    const actor = { userId: club.treasurer.id };
    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () => ctx.container.finance.expenses.markPaid(actor, id, { payoutReference: 'P', paidOn: '2026-10-30' })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'CONFLICT_STATE')).toBe(true);
    expect(await ledgerOut(ctx.db, id)).toHaveLength(1);
  });
});
