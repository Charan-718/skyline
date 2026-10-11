import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';
import { getTestDb, migrateTestDb, truncateTestDb } from '../helpers/testDb.js';
import { createClub, createUser } from '../helpers/factories.js';

// Manual create / edit / publish enforce the same schedule rules as the event agent.

const H = { 'X-Requested-With': 'soms' };
const day = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const valid = () => ({
  title: 'Gala',
  venue: 'Hall',
  startsAt: iso(30 * day),
  endsAt: iso(30 * day + 3 * 3_600_000),
  registrationOpensAt: iso(-day),
  registrationClosesAt: iso(29 * day),
  capacity: 50,
  memberPricePaise: 10000,
  nonMemberPricePaise: 15000,
});

describe('event rules on the API', () => {
  let app;
  let db;
  let agent;
  let club;
  let head;

  beforeAll(async () => {
    db = getTestDb();
    await migrateTestDb();
    ({ app } = createTestApp({ assistantGemini: null }));
  });

  beforeEach(async () => {
    await truncateTestDb();
    head = await createUser(db);
    club = await createClub(db);
    await db('club_role_assignments').insert({ club_id: club.id, user_id: head.id, role: 'CLUB_HEAD', assigned_by: head.id });
    agent = request.agent(app);
    await agent.post('/api/v1/auth/login').set(H).send({ email: head.email, password: 'TestPass123!' }).expect(200);
  });

  const create = (body) => agent.post(`/api/v1/clubs/${club.id}/events`).set(H).send(body);

  it('create: rejects yesterday, out-of-order times and an early bird without an end — with per-field errors', async () => {
    expect((await create(valid())).status).toBe(201);
    const past = await create({ ...valid(), startsAt: iso(-day), endsAt: iso(-day + 3_600_000), registrationClosesAt: iso(-day - 3_600_000), registrationOpensAt: iso(-2 * day) });
    expect(past.status).toBe(400);
    expect(past.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(past.body.error.details.fields).toMatchObject({ startsAt: 'Must be in the future.' });
    const order = await create({ ...valid(), endsAt: valid().startsAt });
    expect(order.body.error.details.fields).toEqual({ endsAt: 'Must be after the start.' });
    const eb = await create({ ...valid(), earlyBirdMemberPricePaise: 8000 });
    expect(eb.body.error.details.fields).toEqual({ earlyBirdEndsAt: 'Set when early-bird pricing ends.' });
  });

  it('update: checks the merged event; unrelated edits on old data still work', async () => {
    const { body } = await create(valid());
    const id = body.data.id;
    expect((await agent.patch(`/api/v1/events/${id}`).set(H).send({ nonMemberPricePaise: 20000 })).status).toBe(200);
    const bad = await agent.patch(`/api/v1/events/${id}`).set(H).send({ startsAt: iso(29 * day - 3_600_000) }); // before registration closes
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields).toEqual({ registrationClosesAt: 'Registration must close before the event starts.' });
    // An event whose dates are already in the past can still get a venue fix.
    await db('events').where({ id }).update({ starts_at: iso(-2 * day), ends_at: iso(-2 * day + 3_600_000), registration_closes_at: iso(-3 * day), registration_opens_at: iso(-9 * day) });
    expect((await agent.patch(`/api/v1/events/${id}`).set(H).send({ venue: 'Hall 2' })).status).toBe(200);
  });

  it('publish: refused when registration has already closed', async () => {
    const { body } = await create(valid());
    const id = body.data.id;
    await db('event_organizers').insert({ event_id: id, user_id: head.id, assigned_by: head.id });
    await db('events').where({ id }).update({ registration_closes_at: iso(-3_600_000) });
    const res = await agent.post(`/api/v1/events/${id}/publish`).set(H);
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.registrationClosesAt).toMatch(/already closed/);
  });
});
