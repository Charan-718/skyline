import request from 'supertest';
import { expect } from 'vitest';
import { assignRole, makeClub, makeEventWithOrganizer, makeUser } from '../fixtures/factories.js';

// Shared cast for TC-AZ-01 tables (each role, same club and other club):
//   ANON        not signed in
//   AUTH_OTHER  signed in, no standing in club A
//   VOL_A       volunteer of A        TR_A treasurer of A       CH_A club head of A
//   ORG_A       organizer of an event of A, no club role (TEAM via organizer)
//   TR_B / CH_B treasurer / head of club B (no standing in A)

export async function makeCast(ctx) {
  const volunteer = await makeUser(ctx.db, { fullName: 'Vol A' });
  const organizer = await makeUser(ctx.db, { fullName: 'Org A' });
  const other = await makeUser(ctx.db, { fullName: 'Other' });
  const a = await makeClub(ctx.db, { volunteers: [volunteer] });
  const b = await makeClub(ctx.db);
  await makeEventWithOrganizer(ctx.db, { club: a.club, head: a.head, organizer });
  const users = { AUTH_OTHER: other, VOL_A: volunteer, TR_A: a.treasurer, CH_A: a.head, ORG_A: organizer, TR_B: b.treasurer, CH_B: b.head };
  const agents = { ANON: request.agent(ctx.app) };
  for (const [name, user] of Object.entries(users)) agents[name] = await ctx.signIn(user.id);
  return { a, b, users, agents, assignRole: (club, user, role) => assignRole(ctx.db, club.id, user.id, role) };
}

const CODES = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' };

/** rows: [[endpointName, actor, expectedStatus]]; endpoints: name -> (agent) => request. */
export function matrixRows(matrix) {
  return Object.entries(matrix).flatMap(([endpoint, expected]) => Object.entries(expected).map(([actor, status]) => [endpoint, actor, status]));
}

export async function expectStatus(res, status) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  if (CODES[status]) expect(res.body.error.code).toBe(CODES[status]);
}
