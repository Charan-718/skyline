import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { makeClub, makeFundraiser, makeTask, makeUser } from '../fixtures/factories.js';

// T-70 — LLD §4.8 fundraisers & tasks; TC-FUN-02.

const H = { 'X-Requested-With': 'soms' };

describe('fundraisers & tasks API (T-70)', () => {
  let ctx;
  let club;
  let volunteer;
  let volunteer2;
  beforeAll(() => {
    ctx = buildTestContext();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await truncateAll(ctx.db);
    volunteer = await makeUser(ctx.db, { fullName: 'Vol One' });
    volunteer2 = await makeUser(ctx.db, { fullName: 'Vol Two' });
    club = await makeClub(ctx.db, { volunteers: [volunteer, volunteer2] });
  });

  describe('fundraisers', () => {
    it('club head creates a PLANNING fundraiser; listed for the team', async () => {
      const head = await ctx.signIn(club.head.id);
      const res = await head
        .post(`/api/v1/clubs/${club.club.id}/fundraisers`)
        .set(H)
        .send({ name: 'Bake sale', description: 'Cakes', startsOn: '2026-11-01', targetDate: '2026-11-30', goalAmountPaise: 500000 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Bake sale', status: 'PLANNING', startsOn: '2026-11-01', targetDate: '2026-11-30', goalAmountPaise: 500000 });
      const list = await (await ctx.signIn(volunteer.id)).get(`/api/v1/clubs/${club.club.id}/fundraisers?status=PLANNING`);
      expect(list.status).toBe(200);
      expect(list.body.data.map((x) => x.id)).toEqual([res.body.data.id]);
    });

    it('validation: targetDate before startsOn, bad dates, non-integer goal, unknown fields', async () => {
      const head = await ctx.signIn(club.head.id);
      const post = (body) => head.post(`/api/v1/clubs/${club.club.id}/fundraisers`).set(H).send(body);
      const base = { name: 'X', startsOn: '2026-11-01', targetDate: '2026-11-30' };
      for (const body of [
        { ...base, targetDate: '2026-10-31' },
        { ...base, startsOn: '2026-02-30' },
        { ...base, goalAmountPaise: 10.5 },
        { ...base, goalAmountPaise: 0 },
        { ...base, status: 'ACTIVE' },
        { ...base, name: '' },
      ]) {
        const res = await post(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('PATCH: PLANNING → ACTIVE → COMPLETED; invalid transition and closed edits are CONFLICT_STATE', async () => {
      const f = await makeFundraiser(ctx.db, club, { status: 'PLANNING' });
      const head = await ctx.signIn(club.head.id);
      const patch = (body) => head.patch(`/api/v1/fundraisers/${f.id}`).set(H).send(body);
      expect((await patch({ status: 'COMPLETED' })).body.error).toMatchObject({ code: 'CONFLICT_STATE', details: { currentStatus: 'PLANNING' } });
      expect((await patch({ status: 'ACTIVE', goalAmountPaise: 100 })).body.data).toMatchObject({ status: 'ACTIVE', goalAmountPaise: 100 });
      const done = await patch({ status: 'COMPLETED' });
      expect(done.body.data.status).toBe('COMPLETED');
      expect(done.body.data.completedAt).toBe(ctx.clock.now().toISOString());
      expect((await patch({ name: 'renamed' })).status).toBe(409);
      expect((await patch({ status: 'CANCELLED' })).body.error.code).toBe('CONFLICT_STATE');
    });

    it('cancel from PLANNING or ACTIVE; patch keeps dates ordered', async () => {
      const head = await ctx.signIn(club.head.id);
      const a = await makeFundraiser(ctx.db, club, { status: 'PLANNING' });
      const b = await makeFundraiser(ctx.db, club, { status: 'ACTIVE' });
      expect((await head.patch(`/api/v1/fundraisers/${a.id}`).set(H).send({ status: 'CANCELLED' })).body.data.status).toBe('CANCELLED');
      expect((await head.patch(`/api/v1/fundraisers/${b.id}`).set(H).send({ status: 'CANCELLED' })).body.data.status).toBe('CANCELLED');
      const c = await makeFundraiser(ctx.db, club, { status: 'ACTIVE' });
      const bad = await head.patch(`/api/v1/fundraisers/${c.id}`).set(H).send({ targetDate: '2026-09-01' });
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      expect((await head.patch(`/api/v1/fundraisers/${c.id}`).set(H).send({})).status).toBe(400);
    });
  });

  describe('tasks', () => {
    it('club head creates a task for a club role holder', async () => {
      const f = await makeFundraiser(ctx.db, club);
      const res = await (await ctx.signIn(club.head.id))
        .post(`/api/v1/fundraisers/${f.id}/tasks`)
        .set(H)
        .send({ title: 'Posters', description: 'Print 50', assigneeUserId: volunteer.id, deadline: '2026-11-10T18:00:00+05:30' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: 'Posters',
        status: 'TODO',
        progressPercent: 0,
        assignee: { id: volunteer.id, fullName: 'Vol One' },
        deadline: '2026-11-10T12:30:00.000Z',
      });
    });

    it('ASSIGNEE_NOT_IN_CLUB for a user without an active club role; unassigned tasks allowed', async () => {
      const f = await makeFundraiser(ctx.db, club);
      const head = await ctx.signIn(club.head.id);
      const outsider = await makeUser(ctx.db);
      const res = await head.post(`/api/v1/fundraisers/${f.id}/tasks`).set(H).send({ title: 'X', assigneeUserId: outsider.id, deadline: '2026-11-10T00:00:00Z' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ASSIGNEE_NOT_IN_CLUB');
      await ctx.db('club_role_assignments').where({ user_id: volunteer2.id }).update({ revoked_at: new Date() });
      const revoked = await head.post(`/api/v1/fundraisers/${f.id}/tasks`).set(H).send({ title: 'X', assigneeUserId: volunteer2.id, deadline: '2026-11-10T00:00:00Z' });
      expect(revoked.body.error.code).toBe('ASSIGNEE_NOT_IN_CLUB');
      const none = await head.post(`/api/v1/fundraisers/${f.id}/tasks`).set(H).send({ title: 'X', deadline: '2026-11-10T00:00:00Z' });
      expect(none.status).toBe(201);
      expect(none.body.data.assignee).toBeNull();
    });

    it('FUNDRAISER_CLOSED when creating or updating tasks of a COMPLETED/CANCELLED fundraiser', async () => {
      const head = await ctx.signIn(club.head.id);
      for (const status of ['COMPLETED', 'CANCELLED']) {
        const f = await makeFundraiser(ctx.db, club, { status });
        const res = await head.post(`/api/v1/fundraisers/${f.id}/tasks`).set(H).send({ title: 'X', deadline: '2026-11-10T00:00:00Z' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatchObject({ code: 'FUNDRAISER_CLOSED', details: { fundraiserStatus: status } });
        const task = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer.id });
        const upd = await (await ctx.signIn(volunteer.id)).patch(`/api/v1/tasks/${task.id}`).set(H).send({ progressPercent: 10 });
        expect(upd.body.error.code).toBe('FUNDRAISER_CLOSED');
      }
    });

    it('TC-FUN-02: assignee updates own status/progress; other fields 403; another volunteer’s task 404', async () => {
      const f = await makeFundraiser(ctx.db, club);
      const mine = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer.id });
      const theirs = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer2.id });
      const vol = await ctx.signIn(volunteer.id);

      const progress = await vol.patch(`/api/v1/tasks/${mine.id}`).set(H).send({ progressPercent: 40 });
      expect(progress.body.data).toMatchObject({ status: 'IN_PROGRESS', progressPercent: 40 });
      const done = await vol.patch(`/api/v1/tasks/${mine.id}`).set(H).send({ status: 'DONE' });
      expect(done.body.data).toMatchObject({ status: 'DONE', progressPercent: 100, completedAt: ctx.clock.now().toISOString() });

      for (const body of [{ title: 'mine now' }, { deadline: '2027-01-01T00:00:00Z' }, { assigneeUserId: volunteer2.id }, { status: 'DONE', title: 'x' }]) {
        const res = await vol.patch(`/api/v1/tasks/${mine.id}`).set(H).send(body);
        expect(res.status, JSON.stringify(body)).toBe(403);
        expect(res.body.error.code).toBe('FIELD_NOT_EDITABLE');
      }
      const other = await vol.patch(`/api/v1/tasks/${theirs.id}`).set(H).send({ progressPercent: 10 });
      expect(other.status).toBe(404);
      expect((await ctx.db('fundraiser_tasks').where({ id: theirs.id }).first()).progress_percent).toBe(0);
    });

    it('reopen and cancel are club-head only; head may edit every field and reassign', async () => {
      const f = await makeFundraiser(ctx.db, club);
      const task = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer.id, status: 'DONE' });
      const vol = await ctx.signIn(volunteer.id);
      const head = await ctx.signIn(club.head.id);
      expect((await vol.patch(`/api/v1/tasks/${task.id}`).set(H).send({ status: 'IN_PROGRESS' })).status).toBe(403);
      const reopened = await head.patch(`/api/v1/tasks/${task.id}`).set(H).send({ status: 'IN_PROGRESS', progressPercent: 70, title: 'Redo', assigneeUserId: volunteer2.id });
      expect(reopened.body.data).toMatchObject({ status: 'IN_PROGRESS', progressPercent: 70, title: 'Redo', completedAt: null, assignee: { id: volunteer2.id } });
      expect((await vol.patch(`/api/v1/tasks/${task.id}`).set(H).send({ progressPercent: 80 })).status).toBe(404);
      const outsider = await makeUser(ctx.db);
      expect((await head.patch(`/api/v1/tasks/${task.id}`).set(H).send({ assigneeUserId: outsider.id })).body.error.code).toBe('ASSIGNEE_NOT_IN_CLUB');
      expect((await head.patch(`/api/v1/tasks/${task.id}`).set(H).send({ status: 'CANCELLED' })).body.data.status).toBe('CANCELLED');
      expect((await head.patch(`/api/v1/tasks/${task.id}`).set(H).send({ status: 'TODO' })).body.error.code).toBe('CONFLICT_STATE');
    });

    it('an assignee whose club role was revoked can no longer update the task (OQ-40)', async () => {
      const f = await makeFundraiser(ctx.db, club);
      const task = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer.id });
      await ctx.db('club_role_assignments').where({ user_id: volunteer.id }).update({ revoked_at: new Date() });
      expect((await (await ctx.signIn(volunteer.id)).patch(`/api/v1/tasks/${task.id}`).set(H).send({ progressPercent: 5 })).status).toBe(404);
    });

    it('validation: progressPercent 0–100 integer, unknown status, empty body', async () => {
      const f = await makeFundraiser(ctx.db, club);
      const task = await makeTask(ctx.db, f, club.head, { assigneeUserId: volunteer.id });
      const vol = await ctx.signIn(volunteer.id);
      for (const body of [{ progressPercent: 101 }, { progressPercent: 10.5 }, { status: 'BLOCKED' }, {}]) {
        expect((await vol.patch(`/api/v1/tasks/${task.id}`).set(H).send(body)).status).toBe(400);
      }
    });

    it('GET /me/tasks: own tasks across clubs with fundraiser name and overdue flag', async () => {
      const otherClub = await makeClub(ctx.db, { volunteers: [volunteer] });
      const f1 = await makeFundraiser(ctx.db, club, { name: 'Sale A' });
      const f2 = await makeFundraiser(ctx.db, otherClub, { name: 'Sale B' });
      const overdue = await makeTask(ctx.db, f1, club.head, { assigneeUserId: volunteer.id, deadline: '2026-10-20T00:00:00Z' });
      const future = await makeTask(ctx.db, f2, otherClub.head, { assigneeUserId: volunteer.id, deadline: '2026-12-20T00:00:00Z' });
      await makeTask(ctx.db, f1, club.head, { assigneeUserId: volunteer2.id });
      const res = await (await ctx.signIn(volunteer.id)).get('/api/v1/me/tasks');
      expect(res.status).toBe(200);
      expect(res.body.data.map((t) => [t.id, t.fundraiserName, t.overdue])).toEqual([
        [overdue.id, 'Sale A', true],
        [future.id, 'Sale B', false],
      ]);
      const filtered = await (await ctx.signIn(volunteer.id)).get('/api/v1/me/tasks?status=DONE');
      expect(filtered.body.data).toEqual([]);
    });
  });
});
