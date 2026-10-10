import { afterAll, beforeAll, describe, it } from 'vitest';
import { buildTestContext } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { makeFundraiser, makeTask } from '../fixtures/factories.js';
import { expectStatus, makeCast, matrixRows } from '../helpers/authzMatrix.js';

// TC-AZ-01 rows for the fundraiser endpoints (T-70, T-71).

describe('TC-AZ-01 — fundraisers & tasks', () => {
  let ctx;
  let cast;
  let fundraiser;
  let task;
  const H = { 'X-Requested-With': 'soms' };

  beforeAll(async () => {
    ctx = buildTestContext();
    await truncateAll(ctx.db);
    cast = await makeCast(ctx);
    fundraiser = await makeFundraiser(ctx.db, cast.a);
    task = await makeTask(ctx.db, fundraiser, cast.a.head, { assigneeUserId: cast.users.VOL_A.id });
  });
  afterAll(() => ctx.close());

  const endpoints = {
    'GET /clubs/:A/fundraisers': (ag) => ag.get(`/api/v1/clubs/${cast.a.club.id}/fundraisers`),
    'POST /clubs/:A/fundraisers': (ag) =>
      ag.post(`/api/v1/clubs/${cast.a.club.id}/fundraisers`).set(H).send({ name: 'Matrix', startsOn: '2026-11-01', targetDate: '2026-11-30' }),
    'PATCH /fundraisers/:id': (ag) => ag.patch(`/api/v1/fundraisers/${fundraiser.id}`).set(H).send({ description: 'matrix' }),
    'GET /fundraisers/:id/overview': (ag) => ag.get(`/api/v1/fundraisers/${fundraiser.id}/overview`),
    'POST /fundraisers/:id/tasks': (ag) => ag.post(`/api/v1/fundraisers/${fundraiser.id}/tasks`).set(H).send({ title: 'M', deadline: '2026-11-20T00:00:00Z' }),
    'PATCH /tasks/:id (assigned to VOL_A)': (ag) => ag.patch(`/api/v1/tasks/${task.id}`).set(H).send({ progressPercent: 10 }),
    'GET /me/tasks': (ag) => ag.get('/api/v1/me/tasks'),
  };

  // OQ-38 APPROVED: organizers are TEAM only for the finance summary, so fundraiser reads are 403 for ORG_A.
  const teamRead = { ANON: 401, AUTH_OTHER: 404, VOL_A: 200, TR_A: 200, CH_A: 200, ORG_A: 403, TR_B: 404, CH_B: 404 };
  const headWrite = (ok) => ({ ANON: 401, AUTH_OTHER: 404, VOL_A: 403, TR_A: 403, CH_A: ok, ORG_A: 403, TR_B: 404, CH_B: 404 });
  const matrix = {
    'GET /clubs/:A/fundraisers': teamRead,
    'POST /clubs/:A/fundraisers': headWrite(201),
    'PATCH /fundraisers/:id': headWrite(200),
    'GET /fundraisers/:id/overview': teamRead,
    'POST /fundraisers/:id/tasks': headWrite(201),
    'PATCH /tasks/:id (assigned to VOL_A)': { ANON: 401, AUTH_OTHER: 404, VOL_A: 200, TR_A: 404, CH_A: 200, ORG_A: 404, TR_B: 404, CH_B: 404 },
    'GET /me/tasks': { ANON: 401, AUTH_OTHER: 200, VOL_A: 200, TR_A: 200, CH_A: 200, ORG_A: 200, TR_B: 200, CH_B: 200 },
  };

  it.each(matrixRows(matrix))('%s as %s → %i', async (endpoint, actor, status) => {
    await expectStatus(await endpoints[endpoint](cast.agents[actor]), status);
  });
});
