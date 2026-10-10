import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext, idemKey } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { approve, markPaid, submitExpense } from '../helpers/finance.js';
import { makeClub, makeFundraiser, makeUser } from '../fixtures/factories.js';
import { EXE, PDF } from '../fixtures/files.js';

// T-82 — income entries and budgets (LLD §4.9).

const H = { 'X-Requested-With': 'soms' };

describe('income entries (T-82)', () => {
  let ctx;
  let club;
  let other;
  let volunteer;
  let fundraiser;
  beforeAll(() => {
    ctx = buildTestContext();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await truncateAll(ctx.db);
    volunteer = await makeUser(ctx.db);
    club = await makeClub(ctx.db, { volunteers: [volunteer] });
    other = await makeClub(ctx.db);
    fundraiser = await makeFundraiser(ctx.db, club);
  });

  const post = (agent, clubId, body, key = idemKey()) => agent.post(`/api/v1/clubs/${clubId}/income-entries`).set(H).set('Idempotency-Key', key).send(body);
  const body = (extra = {}) => ({ fundraiserId: fundraiser.id, amountPaise: 15000, receivedOn: '2026-10-31', description: 'Bake sale cash', reference: 'BOX-1', ...extra });

  it('treasurer records income: ledger IN FUNDRAISER_INCOME linked to the fundraiser, audited', async () => {
    const res = await post(await ctx.signIn(club.treasurer.id), club.club.id, body());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      direction: 'IN',
      category: 'FUNDRAISER_INCOME',
      amountPaise: 15000,
      fundraiserId: fundraiser.id,
      source: { type: 'INCOME_ENTRY' },
      reference: 'BOX-1',
      occurredAt: '2026-10-30T18:30:00.000Z',
      evidenceFileId: null,
    });
    expect(await ctx.db('audit_logs').where({ action: 'INCOME_RECORDED' })).toHaveLength(1);
    const overview = await (await ctx.signIn(club.head.id)).get(`/api/v1/fundraisers/${fundraiser.id}/overview`);
    expect(overview.body.data.money.incomePaise).toBe(15000);
  });

  it('optional evidence file (multipart, validated like receipts)', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const res = await tr
      .post(`/api/v1/clubs/${club.club.id}/income-entries`)
      .set(H)
      .set('Idempotency-Key', idemKey())
      .field('fundraiserId', fundraiser.id)
      .field('amountPaise', '5000')
      .field('receivedOn', '2026-10-31')
      .field('description', 'Online donations')
      .attach('evidence', PDF, 'statement.pdf');
    expect(res.status).toBe(201);
    const file = await ctx.db('uploaded_files').where({ id: res.body.data.evidenceFileId }).first();
    expect(file).toMatchObject({ mime_type: 'application/pdf', original_name: 'statement.pdf' });
    const bad = await tr
      .post(`/api/v1/clubs/${club.club.id}/income-entries`)
      .set(H)
      .set('Idempotency-Key', idemKey())
      .field('fundraiserId', fundraiser.id)
      .field('amountPaise', '5000')
      .field('receivedOn', '2026-10-31')
      .field('description', 'x')
      .attach('evidence', EXE, 'statement.pdf');
    expect(bad.status).toBe(415);
  });

  it('FUNDRAISER_NOT_IN_CLUB for another club’s or an unknown fundraiser', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const otherF = await makeFundraiser(ctx.db, other);
    for (const fundraiserId of [otherF.id, crypto.randomUUID()]) {
      const res = await post(tr, club.club.id, body({ fundraiserId }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FUNDRAISER_NOT_IN_CLUB');
    }
    expect(await ctx.db('financial_transactions')).toHaveLength(0);
  });

  it('OQ-53: no new income for a COMPLETED or CANCELLED fundraiser (409 FUNDRAISER_CLOSED); PLANNING is fine', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    for (const status of ['COMPLETED', 'CANCELLED']) {
      const f = await makeFundraiser(ctx.db, club, { status });
      const res = await post(tr, club.club.id, body({ fundraiserId: f.id }));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'FUNDRAISER_CLOSED', details: { fundraiserStatus: status } });
    }
    expect(await ctx.db('financial_transactions')).toHaveLength(0);
    const planning = await makeFundraiser(ctx.db, club, { status: 'PLANNING' });
    expect((await post(tr, club.club.id, body({ fundraiserId: planning.id }))).status).toBe(201);
  });

  it('only the treasurer: club head and volunteer 403, other club 404', async () => {
    for (const [user, status] of [[club.head, 403], [volunteer, 403], [other.treasurer, 404]]) {
      expect((await post(await ctx.signIn(user.id), club.club.id, body())).status).toBe(status);
    }
  });

  it('validation: decimal amount, zero, future receivedOn, missing description', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    for (const extra of [{ amountPaise: 10.5 }, { amountPaise: 0 }, { receivedOn: '2026-11-02' }, { description: '' }]) {
      const res = await post(tr, club.club.id, body(extra));
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it('idempotent: replay returns the stored response and posts once', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const key = idemKey();
    const a = await post(tr, club.club.id, body(), key);
    const b = await post(tr, club.club.id, body(), key);
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
    expect(await ctx.db('financial_transactions')).toHaveLength(1);
  });
});

describe('budgets (T-82)', () => {
  let ctx;
  let club;
  let other;
  let volunteer;
  beforeAll(() => {
    ctx = buildTestContext();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await truncateAll(ctx.db);
    volunteer = await makeUser(ctx.db);
    club = await makeClub(ctx.db, { volunteers: [volunteer] });
    other = await makeClub(ctx.db);
  });

  const create = (agent, clubId, body) => agent.post(`/api/v1/clubs/${clubId}/budgets`).set(H).send(body);
  const patch = (agent, id, body) => agent.patch(`/api/v1/budgets/${id}`).set(H).send(body);
  const odd = { name: 'Odd semester', periodStart: '2026-07-01', periodEnd: '2026-12-31', amountPaise: 400000 };

  it('treasurer creates; CH and TR read with spent / committed / remaining', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const res = await create(tr, club.club.id, { ...odd, notes: 'Approved at GBM' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Odd semester', amountPaise: 400000, spentPaise: 0, committedPaise: 0, remainingPaise: 400000, notes: 'Approved at GBM' });
    expect(await ctx.db('audit_logs').where({ action: 'BUDGET_CREATED' })).toHaveLength(1);

    // spent: a PAID direct expense (OUT 12000, 2026-10-29) and a paid reimbursement (OUT 25000, paid 2026-10-30)
    // committed: an APPROVED reimbursement incurred 2026-10-20 (8000); SUBMITTED (5000) is ignored.
    await submitExpense(tr, club.club.id, { kind: 'DIRECT', amountPaise: '12000', incurredOn: '2026-10-29' });
    const vol = await ctx.signIn(volunteer.id);
    const paid = (await submitExpense(vol, club.club.id, { amountPaise: '25000', incurredOn: '2026-10-10' })).body.data;
    await approve(tr, paid.id);
    await markPaid(tr, paid.id, { payoutReference: 'UPI-1', paidOn: '2026-10-30' });
    const committed = (await submitExpense(vol, club.club.id, { amountPaise: '8000', incurredOn: '2026-10-20' })).body.data;
    await approve(tr, committed.id);
    await submitExpense(vol, club.club.id, { amountPaise: '5000', incurredOn: '2026-10-21' });

    for (const reader of [club.head, club.treasurer]) {
      const list = await (await ctx.signIn(reader.id)).get(`/api/v1/clubs/${club.club.id}/budgets`);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        amountPaise: 400000,
        spentPaise: 37000,
        committedPaise: 8000,
        remainingPaise: 363000,
        remainingAfterCommittedPaise: 355000,
      });
    }
  });

  it('BUDGET_PERIOD_OVERLAP on create (any overlap, including one shared day); adjacent periods are fine; other clubs independent', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const first = await create(tr, club.club.id, odd);
    for (const period of [
      { periodStart: '2026-12-31', periodEnd: '2027-06-30' },
      { periodStart: '2026-01-01', periodEnd: '2026-07-01' },
      { periodStart: '2026-08-01', periodEnd: '2026-08-31' },
      { periodStart: '2026-01-01', periodEnd: '2027-12-31' },
    ]) {
      const res = await create(tr, club.club.id, { ...odd, name: 'X', ...period });
      expect(res.status, JSON.stringify(period)).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'BUDGET_PERIOD_OVERLAP', details: { budgetId: first.body.data.id } });
    }
    expect((await create(tr, club.club.id, { ...odd, name: 'Even', periodStart: '2027-01-01', periodEnd: '2027-06-30' })).status).toBe(201);
    expect((await create(await ctx.signIn(other.treasurer.id), other.club.id, odd)).status).toBe(201);
  });

  it('BUDGET_PERIOD_OVERLAP on update; updating a budget within its own period is fine', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const a = (await create(tr, club.club.id, odd)).body.data;
    const b = (await create(tr, club.club.id, { ...odd, name: 'Even', periodStart: '2027-01-01', periodEnd: '2027-06-30' })).body.data;
    const clash = await patch(tr, b.id, { periodStart: '2026-12-15' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('BUDGET_PERIOD_OVERLAP');
    const own = await patch(tr, a.id, { periodEnd: '2026-12-30', amountPaise: 450000, name: 'Odd (revised)' });
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ periodEnd: '2026-12-30', amountPaise: 450000, name: 'Odd (revised)' });
    expect((await patch(tr, a.id, { periodEnd: '2026-06-30' })).body.error.code).toBe('VALIDATION_FAILED');
    expect(await ctx.db('audit_logs').where({ action: 'BUDGET_UPDATED' })).toHaveLength(1);
  });

  it('validation: amount must be a positive integer; periodEnd ≥ periodStart', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    for (const extra of [{ amountPaise: 0 }, { amountPaise: 100.5 }, { periodEnd: '2026-06-30' }, { name: '' }]) {
      expect((await create(tr, club.club.id, { ...odd, ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    const a = (await create(tr, club.club.id, odd)).body.data;
    expect((await patch(tr, a.id, { amountPaise: -1 })).status).toBe(400);
    expect((await patch(tr, a.id, {})).status).toBe(400);
  });

  it('only the treasurer writes: CH/VOL 403, other club 404; unknown budget 404', async () => {
    const tr = await ctx.signIn(club.treasurer.id);
    const a = (await create(tr, club.club.id, odd)).body.data;
    for (const [user, status] of [[club.head, 403], [volunteer, 403], [other.treasurer, 404]]) {
      const agent = await ctx.signIn(user.id);
      expect((await create(agent, club.club.id, { ...odd, periodStart: '2028-01-01', periodEnd: '2028-02-01' })).status).toBe(status);
      expect((await patch(agent, a.id, { name: 'hijack' })).status).toBe(status);
    }
    expect((await patch(tr, crypto.randomUUID(), { name: 'x' })).status).toBe(404);
  });

  it('concurrent overlapping creates: exactly one wins', async () => {
    const agents = await Promise.all(Array.from({ length: 5 }, () => ctx.signIn(club.treasurer.id)));
    const results = await Promise.all(agents.map((ag, i) => create(ag, club.club.id, { ...odd, name: `B${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await ctx.db('budgets')).toHaveLength(1);
  });
});
