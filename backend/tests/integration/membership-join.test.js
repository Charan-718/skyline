import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';
import { getTestDb, migrateTestDb, truncateTestDb } from '../helpers/testDb.js';
import { createUser, createClub, createPlan, verifyStudent } from '../helpers/factories.js';
import { v4 as uuidv4 } from 'uuid';

describe('membership join TC-MEM-01', () => {
  let app;
  let db;

  beforeAll(async () => {
    db = getTestDb();
    await migrateTestDb();
    await truncateTestDb();
    ({ app } = createTestApp());
  });

  it('join then payment success activates membership and ledger', async () => {
    const user = await createUser(db);
    await verifyStudent(db, user.id);
    const club = await createClub(db);
    const plan = await createPlan(db, club.id, user.id, { feePaise: 50000, durationMonths: 12 });

    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'soms')
      .send({ email: user.email, password: 'TestPass123!' });

    const join = await agent
      .post(`/api/v1/clubs/${club.id}/memberships`)
      .set('X-Requested-With', 'soms')
      .set('Idempotency-Key', uuidv4())
      .send({ planId: plan.id, expectedFeePaise: 50000 });
    expect(join.status).toBe(201);
    const paymentId = join.body.data.payment.id;

    const sim = await agent
      .post(`/api/v1/payments/${paymentId}/simulate`)
      .set('X-Requested-With', 'soms')
      .set('Idempotency-Key', uuidv4())
      .send({ outcome: 'SUCCEEDED' });
    expect(sim.status).toBe(200);
    expect(sim.body.data.status).toBe('SUCCEEDED');

    const membership = await db('memberships').where({ user_id: user.id, club_id: club.id }).first();
    expect(membership.status).toBe('ACTIVE');
    expect(membership.member_number).toBeTruthy();

    const ledger = await db('financial_transactions')
      .where({ source_type: 'PAYMENT', source_id: paymentId })
      .first();
    expect(ledger).toBeTruthy();
    expect(ledger.category).toBe('MEMBERSHIP_DUES');
  });
});
