import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';
import { getTestDb, migrateTestDb, truncateTestDb } from '../helpers/testDb.js';
import { createUser, createClub, verifyStudent } from '../helpers/factories.js';
import { v4 as uuidv4 } from 'uuid';

describe('events booking', () => {
  let app;
  let db;

  beforeAll(async () => {
    db = getTestDb();
    await migrateTestDb();
    await truncateTestDb();
    ({ app } = createTestApp());
  });

  it('books event with payment flow', async () => {
    const head = await createUser(db, { email: `head-${Date.now()}@test.skyline.ac.in` });
    await verifyStudent(db, head.id);
    const buyer = await createUser(db, { email: `buyer-${Date.now()}@test.skyline.ac.in` });
    const club = await createClub(db);

    await db('club_role_assignments').insert({
      club_id: club.id,
      user_id: head.id,
      role: 'CLUB_HEAD',
      assigned_by: head.id,
    });

    const agentHead = request.agent(app);
    await agentHead
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'soms')
      .send({ email: head.email, password: 'TestPass123!' });

    const createRes = await agentHead
      .post(`/api/v1/clubs/${club.id}/events`)
      .set('X-Requested-With', 'soms')
      .send({
        title: 'Gala',
        venue: 'Hall',
        startsAt: '2027-06-01T18:00:00.000Z',
        endsAt: '2027-06-01T22:00:00.000Z',
        registrationOpensAt: '2026-01-01T00:00:00.000Z',
        registrationClosesAt: '2027-05-31T23:59:59.000Z',
        capacity: 50,
        memberPricePaise: 10000,
        nonMemberPricePaise: 15000,
      });
    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id;

    await db('event_organizers').insert({
      event_id: eventId,
      user_id: head.id,
      assigned_by: head.id,
    });

    await agentHead.post(`/api/v1/events/${eventId}/publish`).set('X-Requested-With', 'soms');

    const agentBuyer = request.agent(app);
    await agentBuyer
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'soms')
      .send({ email: buyer.email, password: 'TestPass123!' });

    const quote = await agentBuyer.get(`/api/v1/events/${eventId}/price-quote`);
    expect(quote.status).toBe(200);
    const price = quote.body.data.finalPricePaise;

    const book = await agentBuyer
      .post(`/api/v1/events/${eventId}/bookings`)
      .set('X-Requested-With', 'soms')
      .set('Idempotency-Key', uuidv4())
      .send({ expectedFinalPricePaise: price });
    expect(book.status).toBe(201);

    const paymentId = book.body.data.payment.id;
    const sim = await agentBuyer
      .post(`/api/v1/payments/${paymentId}/simulate`)
      .set('X-Requested-With', 'soms')
      .set('Idempotency-Key', uuidv4())
      .send({ outcome: 'SUCCEEDED' });
    expect(sim.status).toBe(200);

    const ticket = await db('tickets').where({ user_id: buyer.id, event_id: eventId }).first();
    expect(ticket).toBeTruthy();
    expect(ticket.status).toBe('VALID');
  });
});
