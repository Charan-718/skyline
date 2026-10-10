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

  it('registers outsider when email is not a college domain', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'soms')
      .send({
        email: `outsider-${Date.now()}@iiitkottayam.ac.in`,
        password: 'SecurePass1!',
        fullName: 'Outsider User',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.accountAudience).toBe('OUTSIDER');
    expect(res.body.data.collegeVerification).toBeNull();
  });

  it('auto-verifies roster college email + full name without student id', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'soms')
      .send({
        email: 'ravi.kumar@skyline.ac.in',
        password: 'SecurePass1!',
        fullName: 'Ravi Kumar',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.accountAudience).toBe('COLLEGE_STUDENT');
    expect(res.body.data.collegeVerification.outcome).toBe('VERIFIED');
  });

  it('rejects club head email when not in college DB', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'soms')
      .send({
        email: 'clubhead@skyline.ac.in',
        password: 'SecurePass1!',
        fullName: 'Wrong Name',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CLUB_HEAD_REGISTRATION_DENIED');
  });

  it('rejects fake college domain email not in roster', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'soms')
      .send({
        email: `fake-${Date.now()}@skyline.ac.in`,
        password: 'SecurePass1!',
        fullName: 'Not In Roster',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('COLLEGE_REGISTRATION_DENIED');
  });

  it('rejects club head name with wrong college email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'soms')
      .send({
        email: `j3bcs60-${Date.now()}@skyline.ac.in`,
        password: 'SecurePass1!',
        fullName: 'Club Head User',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CLUB_HEAD_REGISTRATION_DENIED');
  });

  it('register, login, logout', async () => {
    const email = `auth-${Date.now()}@gmail.com`;
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
