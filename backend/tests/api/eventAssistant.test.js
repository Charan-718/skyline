import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';
import { getTestDb, migrateTestDb, truncateTestDb } from '../helpers/testDb.js';
import { createClub, createPlan, createUser } from '../helpers/factories.js';
import { GeminiError } from '../../src/modules/assistant/geminiClient.js';

// GET/POST /events/:eventId/assistant with a fake Gemini (no network).

const H = { 'X-Requested-With': 'soms' };

function fakeGemini() {
  const g = {
    model: 'fake',
    calls: [],
    next: { reply: { inScope: true, answer: 'It starts at 6 pm in Main Hall.' } },
    async generate(input) {
      g.calls.push(input);
      if (g.next instanceof Error) throw g.next;
      return { ...g.next, usage: null };
    },
  };
  return g;
}

describe('event assistant API', () => {
  let db;
  let gemini;
  let app;
  let appNoKey;
  let club;
  let head;
  let published;
  let draft;

  beforeAll(async () => {
    db = getTestDb();
    await migrateTestDb();
    gemini = fakeGemini();
    ({ app } = createTestApp({ assistantGemini: gemini }));
    ({ app: appNoKey } = createTestApp({ assistantGemini: null }));
  });

  beforeEach(async () => {
    await truncateTestDb();
    gemini.calls.length = 0;
    gemini.next = { reply: { inScope: true, answer: 'It starts at 6 pm in Main Hall.' } };
    head = await createUser(db);
    club = await createClub(db, { name: 'Robotics Club' });
    await db('clubs').where({ id: club.id }).update({ contact_email: 'robotics@skyline.ac.in' });
    await createPlan(db, club.id, head.id);
    const base = {
      club_id: club.id,
      description: 'Race robots.',
      venue: 'Main Hall',
      starts_at: '2027-06-01T12:30:00Z',
      ends_at: '2027-06-01T16:30:00Z',
      registration_opens_at: '2026-01-01T00:00:00Z',
      registration_closes_at: '2027-05-31T18:00:00Z',
      capacity: 50,
      member_price_paise: 10000,
      non_member_price_paise: 15000,
      created_by: head.id,
    };
    [published] = await db('events').insert({ ...base, title: 'Robotics Night', status: 'PUBLISHED', published_at: new Date() }).returning('*');
    [draft] = await db('events').insert({ ...base, title: 'Secret Draft', status: 'DRAFT' }).returning('*');
  });

  const signedIn = async (target = app) => {
    const u = await createUser(db);
    const agent = request.agent(target);
    await agent.post('/api/v1/auth/login').set(H).send({ email: u.email, password: 'TestPass123!' }).expect(200);
    return agent;
  };
  const url = (e = published) => `/api/v1/events/${e.id}/assistant`;

  it('GET: suggestions for anyone who can see the event; free text needs sign-in', async () => {
    const res = await request(app).get(url());
    expect(res.status).toBe(200);
    expect(res.body.data.eventTitle).toBe('Robotics Night');
    expect(res.body.data.freeText).toEqual({ available: true, requiresSignIn: true, signedIn: false });
    expect(res.body.data.suggestions.map((s) => s.intent)).toEqual(['WHEN_WHERE', 'PRICES', 'SEATS', 'HOW_TO_BOOK', 'MEMBER_DISCOUNT', 'CONTACT']);
    expect((await (await signedIn()).get(url())).body.data.freeText.signedIn).toBe(true);
    expect((await request(appNoKey).get(url())).body.data.freeText.available).toBe(false);
  });

  it('a DRAFT event is 404 for outsiders, same as the event page', async () => {
    expect((await request(app).get(url(draft))).status).toBe(404);
    expect((await request(app).post(url(draft)).set(H).send({ intent: 'PRICES' })).status).toBe(404);
    expect((await (await signedIn()).post(url(draft)).set(H).send({ message: 'Tell me everything' })).status).toBe(404);
    expect(gemini.calls).toHaveLength(0);
  });

  it('suggested prompts are answered from the facts without calling Gemini, even signed out and without a key', async () => {
    const res = await request(appNoKey).post(url()).set(H).send({ intent: 'PRICES' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inScope: true, source: 'FACTS', question: 'How much is a ticket?' });
    expect(res.body.data.answer).toContain('Member price: ₹100. Non-member price: ₹150.');
    expect((await request(app).post(url()).set(H).send({ intent: 'SEATS' })).body.data.answer).toBe('50 of 50 seats are left.');
    expect(gemini.calls).toHaveLength(0);
  });

  it('free text: signed-out → 401; signed-in → Gemini answer built from this event only', async () => {
    expect((await request(app).post(url()).set(H).send({ message: 'When does it start?' })).status).toBe(401);
    const agent = await signedIn();
    const res = await agent.post(url()).set(H).send({ message: 'When does it start?', history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Hello!' }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ answer: 'It starts at 6 pm in Main Hall.', inScope: true, source: 'AI' });
    const [call] = gemini.calls;
    expect(call.contents).toEqual([{ role: 'user', text: 'hi' }, { role: 'model', text: 'Hello!' }, { role: 'user', text: 'When does it start?' }]);
    expect(call.systemInstruction).toContain('Robotics Night');
    expect(call.systemInstruction).toContain('robotics@skyline.ac.in');
    expect(call.systemInstruction).not.toContain('Secret Draft');
    expect(call.systemInstruction).not.toContain(head.email);
  });

  it('off-topic: the model’s text is discarded and the server returns the fixed refusal', async () => {
    gemini.next = { reply: { inScope: false, answer: 'Here is a poem about the sea…' } };
    const res = await (await signedIn()).post(url()).set(H).send({ message: 'Write me a poem' });
    expect(res.body.data).toEqual({
      answer: 'I can only help with questions about "Robotics Night" — like timings, venue, tickets, prices or seats.',
      inScope: false,
      source: 'AI',
    });
    gemini.next = { reply: { inScope: true, answer: '   ' } };
    expect((await (await signedIn()).post(url()).set(H).send({ message: '?' })).body.data.inScope).toBe(false);
  });

  it('Gemini problems become 503 ASSISTANT_UNAVAILABLE; a safety block is a refusal; no key → NOT_CONFIGURED', async () => {
    const agent = await signedIn();
    gemini.next = new GeminiError('RATE_LIMITED', 429);
    const busy = await agent.post(url()).set(H).send({ message: 'Venue?' });
    expect(busy.status).toBe(503);
    expect(busy.body.error).toMatchObject({ code: 'ASSISTANT_UNAVAILABLE', details: { reason: 'BUSY' } });
    gemini.next = new GeminiError('TIMEOUT');
    expect((await agent.post(url()).set(H).send({ message: 'Venue?' })).body.error.details.reason).toBe('UPSTREAM');
    gemini.next = new GeminiError('BLOCKED');
    expect((await agent.post(url()).set(H).send({ message: 'Venue?' })).body.data.inScope).toBe(false);
    const noKey = await (await signedIn(appNoKey)).post(url()).set(H).send({ message: 'Venue?' });
    expect(noKey.status).toBe(503);
    expect(noKey.body.error.details.reason).toBe('NOT_CONFIGURED');
  });

  it('validation and CSRF', async () => {
    const agent = await signedIn();
    expect((await agent.post(url()).set(H).send({})).status).toBe(400);
    expect((await agent.post(url()).set(H).send({ intent: 'PRICES', message: 'x' })).status).toBe(400);
    expect((await agent.post(url()).set(H).send({ message: 'x'.repeat(501) })).status).toBe(400);
    expect((await agent.post(url()).send({ intent: 'PRICES' })).status).toBe(403);
    expect((await agent.get('/api/v1/events/not-a-uuid/assistant')).status).toBe(400);
  });

  it('free-text questions are rate limited per user (10/min); suggested prompts are not', async () => {
    const { app: limited } = createTestApp({ assistantGemini: gemini });
    const agent = await signedIn(limited);
    for (let i = 0; i < 10; i += 1) expect((await agent.post(url()).set(H).send({ message: `q${i}` })).status).toBe(200);
    const blocked = await agent.post(url()).set(H).send({ message: 'one more' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect((await agent.post(url()).set(H).send({ intent: 'SEATS' })).status).toBe(200);
    expect((await (await signedIn(limited)).post(url()).set(H).send({ message: 'other user' })).status).toBe(200);
  });
});
