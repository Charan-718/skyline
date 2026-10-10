import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { runJob as runJobLocked } from '../../src/jobs/runJob.js';
import { createContainer } from '../../src/container.js';
import { createApp } from '../../src/app.js';
import { createNotificationsModule } from '../../src/modules/notifications/index.js';
import { createAdapters } from '../../src/modules/notifications/adapters/index.js';
import { createGroup1Bridge } from '../../src/integration/group1Bridge.js';
import { addDaysToDate, todayIST } from '../../src/shared/clock.js';
import { getTestDb, migrateTestDb, truncateTestDb } from '../helpers/testDb.js';
import { createClub, createPlan, createUser } from '../helpers/factories.js';

// Membership-expiry reminders: job -> outbox -> dispatcher -> SMTP (transport faked) and the
// dev trigger endpoint used for the demo.

const H = { 'X-Requested-With': 'soms' };
const smtp = { host: 'smtp.test', port: 465, secure: true, user: 'proto@gmail.com', pass: 'pw', fromEmail: 'proto@gmail.com', fromName: 'SOMS' };

describe('renewal reminders', () => {
  let db;
  let container;
  let app;
  let club;
  let plan;
  const sent = [];

  const transport = {
    sendMail: async (mail) => {
      sent.push(mail);
      return { messageId: `<m${sent.length}@test>` };
    },
  };

  async function member({ daysLeft, status = 'ACTIVE', autopay = false }) {
    const user = await createUser(db);
    const expires = addDaysToDate(todayIST(), daysLeft);
    const [m] = await db('memberships')
      .insert({
        user_id: user.id,
        club_id: club.id,
        status,
        member_number: `T-${Math.random().toString(36).slice(2, 8)}`,
        current_plan_id: plan.id,
        started_on: addDaysToDate(todayIST(), daysLeft - 365),
        expires_on: expires,
        qr_token: `qr-${Math.random().toString(36).slice(2)}`,
        autopay_enabled: autopay,
        autopay_plan_id: autopay ? plan.id : null,
        autopay_amount_paise: autopay ? 50000 : null,
      })
      .returning('*');
    return { user, membership: m, expires };
  }

  const runJob = (options = {}) => runJobLocked('renewal-reminders', `t-${Math.random()}`, (trx) => container.jobs.renewalReminders.execute(trx, options)).then((r) => r.summary);
  const rows = (userId) => db('notification_deliveries').where({ recipient_user_id: userId }).orderBy('channel');

  beforeAll(async () => {
    await migrateTestDb();
    db = getTestDb();
    container = createContainer();
    app = createApp(container);
  });
  afterAll(async () => {
    await db.destroy();
  });
  beforeEach(async () => {
    sent.length = 0;
    await truncateTestDb();
    const head = await createUser(db);
    club = await createClub(db, { name: 'Skyline Demo Club' });
    plan = await createPlan(db, club.id, head.id, { name: 'Annual' });
  });

  it('emails every ACTIVE member expiring in exactly 7 days — and nobody else', async () => {
    const a = await member({ daysLeft: 7 });
    const b = await member({ daysLeft: 7, autopay: true });
    const c = await member({ daysLeft: 7 });
    const sooner = await member({ daysLeft: 6 });
    const later = await member({ daysLeft: 8 });
    const expired = await member({ daysLeft: 7, status: 'EXPIRED' });
    const summary = await runJob();
    expect(summary).toMatchObject({ daysBefore: 7, candidates: 3, autopay: 1, manual: 2, queued: 3, skipped: 0, duplicates: 0 });
    for (const m of [a, b, c]) expect((await rows(m.user.id)).map((x) => [x.channel, x.status, x.template])).toEqual([['EMAIL', 'PENDING', 'RENEWAL_REMINDER_7D']]);
    for (const m of [sooner, later, expired]) expect(await rows(m.user.id)).toHaveLength(0);
  });

  it('expires_on is compared as a date: the 7-day boundary is today + 7 in IST', async () => {
    const edge = await member({ daysLeft: 7 });
    expect(await runJob({ daysBefore: 6 })).toMatchObject({ candidates: 0 });
    expect(await runJob({ daysBefore: 7 })).toMatchObject({ candidates: 1, queued: 1 });
    expect((await rows(edge.user.id))[0].payload.expiresOn).toBe(edge.expires);
  });

  it('running twice does not duplicate (dedupe); resend does', async () => {
    const m = await member({ daysLeft: 7 });
    expect(await runJob()).toMatchObject({ candidates: 1, queued: 1 });
    expect(await runJob()).toMatchObject({ candidates: 1, queued: 0, duplicates: 1 });
    expect(await runJob({ resend: true })).toMatchObject({ queued: 1 });
    expect(await rows(m.user.id)).toHaveLength(2);
  });

  it('a member who already renewed (a later PAID term) is not reminded', async () => {
    const m = await member({ daysLeft: 7 });
    await db('membership_terms').insert({
      membership_id: m.membership.id, club_id: club.id, user_id: m.user.id, kind: 'RENEWAL', plan_id: plan.id, plan_name: 'Annual',
      fee_paise: 50000, duration_months: 12, event_discount_bps: 0, merch_discount_bps: 0, early_bird_access: false, status: 'PAID',
      starts_on: addDaysToDate(todayIST(), 8), ends_on: addDaysToDate(todayIST(), 373), paid_at: new Date(),
    });
    expect((await runJob()).candidates).toBe(0);
  });

  it('two different mails: AutoPay members hear the renewal happens by itself, others are asked to renew', async () => {
    const manual = await member({ daysLeft: 7 });
    const auto = await member({ daysLeft: 7, autopay: true });
    await runJob();
    const notifications = createNotificationsModule({
      db, clock: { now: () => new Date() }, auth: createGroup1Bridge({ db, authRepository: null, authz: null }).auth,
      config: {}, logger: { error() {}, info() {} }, adapters: createAdapters({ mode: 'smtp', smtp, transport }),
    });
    expect(await notifications.dispatchPending()).toMatchObject({ claimed: 2, sent: 2 });
    const mailTo = (email) => sent.find((j) => j.to === email);
    const renew = mailTo(manual.user.email);
    expect(renew.subject).toBe(`Skyline Demo Club: your membership expires in 7 days (${manual.expires})`);
    expect(renew.text).toContain('Renew now');
    expect(renew.text).toContain(`/me/memberships/${manual.membership.id}`);
    expect(renew.text).not.toMatch(/AutoPay/i);
    const autopay = mailTo(auto.user.email);
    expect(autopay.subject).toBe(`Skyline Demo Club: AutoPay will renew your membership in 7 days (${auto.expires})`);
    expect(autopay.text).toContain(`AutoPay is switched on, so your renewal will be triggered automatically on ${auto.expires}`);
    expect(autopay.text).not.toContain('Renew now');
  });

  it('the channel constraint allows email only (no SMS / WhatsApp rows can exist)', async () => {
    const m = await member({ daysLeft: 7 });
    for (const channel of ['SMS', 'WHATSAPP']) {
      await expect(
        db('notification_deliveries').insert({ recipient_user_id: m.user.id, channel, template: 'RENEWAL_REMINDER_7D', payload: '{}', status: 'PENDING', dedupe_key: `x-${channel}` }),
      ).rejects.toMatchObject({ constraint: 'nd_channel' });
    }
  });

  it('dispatcher sends the reminder email over SMTP with the rendered text', async () => {
    const m = await member({ daysLeft: 7 });
    await runJob();
    const notifications = createNotificationsModule({
      db,
      clock: { now: () => new Date() },
      auth: createGroup1Bridge({ db, authRepository: null, authz: null }).auth,
      config: {},
      logger: { error() {}, info() {} },
      adapters: createAdapters({ mode: 'smtp', smtp, transport }),
    });
    expect(await notifications.dispatchPending()).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect((await rows(m.user.id)).map((x) => [x.channel, x.status, x.provider])).toEqual([['EMAIL', 'SENT', 'smtp']]);
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe(m.user.email);
    expect(mail.from).toEqual({ name: 'SOMS', address: 'proto@gmail.com' });
    expect(mail.subject).toContain('Skyline Demo Club');
    expect(mail.text).toContain(`expires in 7 days (${m.expires})`);
  });

  describe('POST /api/v1/dev/jobs/renewal-reminders/run (demo trigger)', () => {
    const login = async () => {
      const u = await createUser(db);
      const agent = request.agent(app);
      await agent.post('/api/v1/auth/login').set(H).send({ email: u.email, password: 'TestPass123!' }).expect(200);
      return agent;
    };

    it('requires a session and the X-Requested-With header', async () => {
      expect((await request(app).post('/api/v1/dev/jobs/renewal-reminders/run').set(H).send({})).status).toBe(401);
      const agent = await login();
      expect((await agent.post('/api/v1/dev/jobs/renewal-reminders/run').send({})).status).toBe(403);
    });

    it('runs the job, dispatches, and reports per-channel results with masked destinations', async () => {
      const m = await member({ daysLeft: 7 });
      const m2 = await member({ daysLeft: 7, autopay: true });
      const agent = await login();
      const res = await agent.post('/api/v1/dev/jobs/renewal-reminders/run').set(H).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.job).toMatchObject({ candidates: 2, autopay: 1, manual: 1, queued: 2 });
      expect(res.body.data.dispatch).toMatchObject({ sent: 2 });
      expect(res.body.data.deliveries.map((d) => [d.channel, d.status]).sort()).toEqual([['EMAIL', 'SENT'], ['EMAIL', 'SENT']]);
      expect(res.body.data.deliveries.map((d) => d.variant).sort()).toEqual(['AUTOPAY', 'RENEW']);
      expect(res.body.data.deliveries[0].destination).toMatch(/^.\*\*\*@/);
      expect(JSON.stringify(res.body)).not.toContain(m.user.email);
      expect(JSON.stringify(res.body)).not.toContain(m2.user.email);
    });

    it('accepts an empty body, rejects unknown fields and out-of-range windows', async () => {
      const agent = await login();
      expect((await agent.post('/api/v1/dev/jobs/renewal-reminders/run').set(H)).status).toBe(200);
      expect((await agent.post('/api/v1/dev/jobs/renewal-reminders/run').set(H).send({ daysBefore: -1 })).status).toBe(400);
      expect((await agent.post('/api/v1/dev/jobs/renewal-reminders/run').set(H).send({ nope: 1 })).status).toBe(400);
    });

    it('dispatch:false only queues; the minute dispatcher sends later', async () => {
      await member({ daysLeft: 7 });
      const agent = await login();
      const res = await agent.post('/api/v1/dev/jobs/renewal-reminders/run').set(H).send({ dispatch: false });
      expect(res.body.data.dispatch).toBeNull();
      expect(res.body.data.deliveries.every((d) => d.status === 'PENDING')).toBe(true);
    });
  });
});
