import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { addDaysToDate, todayIST } from '../../shared/clock.js';

// Demo data for the 7-day membership-expiry reminder (club "Skyline Demo Club", plan "Annual"):
//   DEMO_MEMBER_EMAIL           autopay OFF, expires in 7 days  -> "renew now" email
//   DEMO_AUTOPAY_MEMBER_EMAIL   autopay ON,  expires in 7 days  -> "AutoPay will renew on <date>" email
//   demo.later@example.test     autopay OFF, expires in 20 days -> control, gets nothing today
// Set the first two to addresses you can read. Re-running moves the expiry dates to "today + N"
// again. Never runs in production. Login for every account: SkylineDemo#2026.

const SLUG = 'demo-reminder-club';
const PASSWORD = 'SkylineDemo#2026';

async function ensureUser(knex, email, fullName) {
  const existing = await knex('users').whereRaw('lower(email) = ?', [email]).first();
  if (existing) {
    await knex('users').where({ id: existing.id }).update({ is_active: true });
    return existing;
  }
  const [user] = await knex('users')
    .insert({ email, full_name: fullName, password_hash: await bcrypt.hash(PASSWORD, 12), is_active: true })
    .returning('*');
  return user;
}

async function ensureMembership(knex, { user, club, plan, number, daysLeft, autopay }) {
  const expiresOn = addDaysToDate(todayIST(), daysLeft);
  const fields = {
    status: 'ACTIVE',
    current_plan_id: plan.id,
    started_on: addDaysToDate(expiresOn, -365),
    expires_on: expiresOn,
    autopay_enabled: autopay,
    autopay_plan_id: autopay ? plan.id : null,
    autopay_amount_paise: autopay ? plan.fee_paise : null,
  };
  const existing = await knex('memberships').where({ user_id: user.id, club_id: club.id }).first();
  if (existing) await knex('memberships').where({ id: existing.id }).update(fields);
  else await knex('memberships').insert({ user_id: user.id, club_id: club.id, member_number: number, qr_token: randomBytes(24).toString('hex'), ...fields });
}

export async function seed(knex) {
  if (process.env.NODE_ENV === 'production') return;
  const manualEmail = (process.env.DEMO_MEMBER_EMAIL || 'demo.member@example.test').toLowerCase();
  const autopayEmail = (process.env.DEMO_AUTOPAY_MEMBER_EMAIL || 'demo.autopay@example.test').toLowerCase();

  const manual = await ensureUser(knex, manualEmail, 'Demo Member');
  const autopayUser = await ensureUser(knex, autopayEmail, 'Demo AutoPay Member');
  const later = await ensureUser(knex, 'demo.later@example.test', 'Demo Later Member');

  let club = await knex('clubs').where({ slug: SLUG }).first();
  if (!club) {
    [club] = await knex('clubs')
      .insert({ slug: SLUG, name: 'Skyline Demo Club', description: 'Demo club for reminders', member_number_prefix: 'DEM', is_active: true })
      .returning('*');
  }
  let plan = await knex('membership_plans').where({ club_id: club.id, status: 'ACTIVE' }).first();
  if (!plan) {
    [plan] = await knex('membership_plans')
      .insert({ club_id: club.id, name: 'Annual', fee_paise: 50000, duration_months: 12, status: 'ACTIVE', created_by: manual.id })
      .returning('*');
  }

  await ensureMembership(knex, { user: manual, club, plan, number: 'DEM-000001', daysLeft: 7, autopay: false });
  await ensureMembership(knex, { user: autopayUser, club, plan, number: 'DEM-000002', daysLeft: 7, autopay: true });
  await ensureMembership(knex, { user: later, club, plan, number: 'DEM-000003', daysLeft: 20, autopay: false });
}
