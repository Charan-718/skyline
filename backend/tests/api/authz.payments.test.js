import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestContext, idemKey } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { assignRole, makeClub, makeMembershipPayment, makeUser } from '../fixtures/factories.js';

// TC-AZ-01 rows for the Group 2 endpoints added in Step 2 (each role, same club and other club).
// Expected: 2xx allowed; 403 same-club role without the right; 404 other club / not owner; 401 anonymous.

describe('TC-AZ-01 — payments endpoints', () => {
  let ctx;
  let s; // scenario
  const actors = {};

  beforeAll(async () => {
    ctx = buildTestContext();
    await truncateAll(ctx.db);
    const volunteer = await makeUser(ctx.db, { fullName: 'Vol A' });
    const clubA = await makeClub(ctx.db, { volunteers: [volunteer] });
    const clubB = await makeClub(ctx.db);
    const owner = await makeUser(ctx.db, { fullName: 'Owner' });
    const { payment } = await makeMembershipPayment(ctx, { club: clubA, user: owner });
    const member = await makeUser(ctx.db, { fullName: 'Plain user' });
    // Head of club B who is also a volunteer in club A: only the volunteer right applies in A.
    await assignRole(ctx.db, clubA.club.id, clubB.head.id, 'VOLUNTEER');
    s = { clubA, clubB, payment, owner };
    const users = {
      OWNER: owner,
      AUTH_OTHER: member,
      VOL_A: volunteer,
      TR_A: clubA.treasurer,
      CH_A: clubA.head,
      TR_B: clubB.treasurer,
      CH_B_VOL_A: clubB.head,
    };
    for (const [name, user] of Object.entries(users)) actors[name] = await ctx.signIn(user.id);
    actors.ANON = request.agent(ctx.app);
  });
  afterAll(() => ctx.close());

  const endpoints = {
    'GET /payments/:id': (a) => a.get(`/api/v1/payments/${s.payment.id}`),
    'GET /me/payments': (a) => a.get('/api/v1/me/payments'),
    'GET /clubs/:clubA/payments': (a) => a.get(`/api/v1/clubs/${s.clubA.club.id}/payments`),
    'POST /payments/:id/simulate (PENDING)': (a) =>
      a.post(`/api/v1/payments/${s.payment.id}/simulate`).set('X-Requested-With', 'soms').set('Idempotency-Key', idemKey()).send({ outcome: 'PENDING' }),
  };

  const matrix = {
    'GET /payments/:id':                       { ANON: 401, OWNER: 200, AUTH_OTHER: 404, VOL_A: 404, TR_A: 404, CH_A: 404, TR_B: 404, CH_B_VOL_A: 404 },
    'GET /me/payments':                        { ANON: 401, OWNER: 200, AUTH_OTHER: 200, VOL_A: 200, TR_A: 200, CH_A: 200, TR_B: 200, CH_B_VOL_A: 200 },
    'GET /clubs/:clubA/payments':              { ANON: 401, OWNER: 404, AUTH_OTHER: 404, VOL_A: 403, TR_A: 200, CH_A: 200, TR_B: 404, CH_B_VOL_A: 403 },
    'POST /payments/:id/simulate (PENDING)':   { ANON: 401, OWNER: 200, AUTH_OTHER: 404, VOL_A: 404, TR_A: 404, CH_A: 404, TR_B: 404, CH_B_VOL_A: 404 },
  };

  const rows = Object.entries(matrix).flatMap(([endpoint, expected]) =>
    Object.entries(expected).map(([actor, status]) => [endpoint, actor, status]),
  );

  it.each(rows)('%s as %s → %i', async (endpoint, actor, status) => {
    const res = await endpoints[endpoint](actors[actor]);
    expect(res.status).toBe(status);
    if (status >= 400) {
      const code = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' }[status];
      expect(res.body.error.code).toBe(code);
    }
  });

  it('a club role grants nothing after revocation', async () => {
    await ctx.db('club_role_assignments').where({ club_id: s.clubA.club.id, user_id: s.clubA.treasurer.id }).update({ revoked_at: new Date() });
    const res = await actors.TR_A.get(`/api/v1/clubs/${s.clubA.club.id}/payments`);
    expect(res.status).toBe(404);
  });

  it('unknown club → 404 for everyone', async () => {
    const res = await actors.CH_A.get(`/api/v1/clubs/${crypto.randomUUID()}/payments`);
    expect(res.status).toBe(404);
  });
});
