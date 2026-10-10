import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { makeClub, makeFundraiser, makeTask, makeUser } from '../fixtures/factories.js';

// T-71 — GET /fundraisers/:id/overview and list progress/health; money from ledger sums.

describe('fundraiser overview (T-71)', () => {
  let ctx;
  let club;
  let volunteer;
  beforeAll(() => {
    ctx = buildTestContext();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await truncateAll(ctx.db);
    volunteer = await makeUser(ctx.db, { fullName: 'Vol One' });
    club = await makeClub(ctx.db, { volunteers: [volunteer] });
  });

  const income = (f, amountPaise) =>
    ctx.container.withTransaction((trx) =>
      ctx.container.finance.ledger.post(trx, {
        clubId: f.club_id,
        direction: 'IN',
        category: 'FUNDRAISER_INCOME',
        amountPaise,
        sourceType: 'INCOME_ENTRY',
        sourceId: randomUUID(),
        fundraiserId: f.id,
        description: 'cash box',
        occurredAt: ctx.clock.now(),
      }),
    );

  it('returns progress, health, counts, tasks with overdue flags and ledger money', async () => {
    const f = await makeFundraiser(ctx.db, club, { startsOn: '2026-10-01', targetDate: '2026-11-30', goalAmountPaise: 300000 });
    const overdue = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer.id, deadline: '2026-10-20T00:00:00Z', status: 'IN_PROGRESS', progressPercent: 50 });
    await makeTask(ctx.db, f, club.head, { status: 'DONE' });
    await income(f, 60000);
    await income(f, 40000);
    const other = await makeFundraiser(ctx.db, club);
    await income(other, 99999); // must not leak into f

    const res = await (await ctx.signIn(volunteer.id)).get(`/api/v1/fundraisers/${f.id}/overview`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.fundraiser.id).toBe(f.id);
    expect(d.progressPct).toBe(75); // (50 + 100) / 2
    expect(d.timeElapsedPct).toBe(52);
    expect(d.health).toBe('OFF_TRACK'); // overdue task
    expect(d.counts).toEqual({ todo: 0, inProgress: 1, done: 1, cancelled: 0, overdue: 1 });
    expect(d.tasks.find((t) => t.id === overdue.id)).toMatchObject({ overdue: true, assignee: { id: volunteer.id, fullName: 'Vol One' } });
    expect(d.money).toEqual({ income: 100000, expensesPaid: 0, net: 100000, goalPct: 33 });
  });

  it('money counts OUT rows linked to the fundraiser as expensesPaid', async () => {
    const f = await makeFundraiser(ctx.db, club);
    const [file] = await ctx.db('uploaded_files')
      .insert({ club_id: club.club.id, uploaded_by: club.treasurer.id, purpose: 'RECEIPT', original_name: 'r.pdf', storage_key: `k-${randomUUID()}`, mime_type: 'application/pdf', size_bytes: 10, sha256: 'a'.repeat(64) })
      .returning('*');
    const [expense] = await ctx.db('expenses')
      .insert({ club_id: club.club.id, kind: 'DIRECT', title: 'Banner', amount_paise: 15000, incurred_on: '2026-10-30', fundraiser_id: f.id, receipt_file_id: file.id, submitted_by: club.treasurer.id, status: 'PAID', paid_by: club.treasurer.id, paid_at: new Date() })
      .returning('*');
    await ctx.container.withTransaction((trx) =>
      ctx.container.finance.ledger.post(trx, {
        clubId: club.club.id, direction: 'OUT', category: 'DIRECT_EXPENSE', amountPaise: 15000, sourceType: 'EXPENSE',
        sourceId: expense.id, expenseId: expense.id, fundraiserId: f.id, description: 'Banner', occurredAt: ctx.clock.now(),
      }),
    );
    await income(f, 10000);
    const res = await (await ctx.signIn(club.head.id)).get(`/api/v1/fundraisers/${f.id}/overview`);
    expect(res.body.data.money).toEqual({ income: 10000, expensesPaid: 15000, net: -5000, goalPct: null });
    expect(res.body.data.health).toBe('NO_TASKS');
  });

  it('club list carries progressPct and health per fundraiser', async () => {
    const a = await makeFundraiser(ctx.db, club, { name: 'A', targetDate: '2026-11-30' });
    await makeTask(ctx.db, a, club.head, { status: 'IN_PROGRESS', progressPercent: 40 });
    const b = await makeFundraiser(ctx.db, club, { name: 'B', status: 'COMPLETED', targetDate: '2026-12-15' });
    const res = await (await ctx.signIn(club.treasurer.id)).get(`/api/v1/clubs/${club.club.id}/fundraisers`);
    expect(res.body.data.map((x) => [x.id, x.progressPct, x.health])).toEqual([
      [a.id, 40, 'ON_TRACK'],
      [b.id, 0, 'COMPLETED'],
    ]);
  });

  it('unknown or malformed fundraiser id → 404 / 400', async () => {
    const agent = await ctx.signIn(club.head.id);
    expect((await agent.get(`/api/v1/fundraisers/${randomUUID()}/overview`)).status).toBe(404);
    expect((await agent.get('/api/v1/fundraisers/nope/overview')).status).toBe(400);
  });
});
