import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';
import { migrateTestDb, truncateTestDb } from '../helpers/testDb.js';

describe('auth API TC-AUTH-01', () => {
  let app;
  let agent;

  beforeAll(async () => {
    await migrateTestDb();
    await truncateTestDb();
    ({ app } = createTestApp());
    agent = request.agent(app);
  });

  it('register, login, logout', async () => {
    const email = `auth-${Date.now()}@srkr.ac.in`;
    const register = await agent
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'soms')
      .send({ email, password: 'SecurePass1!', fullName: 'Auth Tester' });
    expect(register.status).toBe(201);

    await agent.post('/api/v1/auth/logout').set('X-Requested-With', 'soms');

    const login = await agent
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'soms')
      .send({ email, password: 'SecurePass1!' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.email).toBe(email);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);

    await agent.post('/api/v1/auth/logout').set('X-Requested-With', 'soms');
    const meAfter = await agent.get('/api/v1/auth/me');
    expect(meAfter.status).toBe(401);
  });
});
