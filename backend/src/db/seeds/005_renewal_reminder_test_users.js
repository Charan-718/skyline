/**
 * QA accounts for POST /dev/jobs/renewal-reminders/run (expires_on = today IST + 7 days).
 * Password for all: demo1234
 */
import bcrypt from 'bcrypt';
import { addDaysToDate, computeTermEndsOn, todayIST } from '../../shared/clock.js';
import { randomToken } from '../../shared/tokens.js';
import { DEMO_PASSWORD, insertUser } from './lib/demoEngagementSeed.js';
import { daysFromNow } from './lib/seedTime.js';

const RENEWAL_TEST_USERS = [
  { email: 'charan06082004@gmail.com', fullName: 'Charan Kumar', studentIdentifier: 'SKY2026QA001' },
  { email: 'koushikt33@gmail.com', fullName: 'Koushik Thummu', studentIdentifier: 'SKY2026QA002' },
  { email: 'nikkath23bcs60@iiitkottayam.ac.in', fullName: 'Nikkath Zabeenshaik', studentIdentifier: 'SKY2026QA003' },
  { email: 'sspavancharan@gmail.com', fullName: 'Sai Pavan Charan', studentIdentifier: 'SKY2026QA004' },
];

const DAYS_UNTIL_EXPIRY = 7;

function startsOnForExpiry(expiresOn, durationMonths) {
  for (let back = 0; back <= 400; back += 1) {
    const candidate = addDaysToDate(expiresOn, -back);
    if (computeTermEndsOn(candidate, durationMonths) === expiresOn) return candidate;
  }
  return addDaysToDate(expiresOn, -180);
}

async function upsertRoster(knex, { studentIdentifier, fullName, collegeEmail }) {
  await knex('college_student_roster')
    .insert({
      student_identifier: studentIdentifier,
      full_name: fullName,
      college_email: collegeEmail?.toLowerCase() ?? null,
      program: 'Renewal QA cohort',
      club_head_eligible: false,
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })
    .onConflict('student_identifier')
    .merge({ full_name: fullName, college_email: collegeEmail?.toLowerCase() ?? null, updated_at: knex.fn.now() });
}

async function ensureVerified(knex, userId, studentIdentifier) {
  const existing = await knex('college_verifications')
    .where({ user_id: userId })
    .whereNull('superseded_at')
    .where({ outcome: 'VERIFIED' })
    .first();
  if (existing) return;
  await knex('college_verifications')
    .where({ user_id: userId })
    .whereNull('superseded_at')
    .update({ superseded_at: knex.fn.now() });
  const crypto = await import('node:crypto');
  const key = process.env.VERIFICATION_HASH_KEY || 'dev-verification-hmac-key-change-in-prod';
  const hash = crypto.createHmac('sha256', key).update(studentIdentifier).digest('hex');
  await knex('college_verifications').insert({
    user_id: userId,
    outcome: 'VERIFIED',
    student_identifier_hash: hash,
    adapter: 'database',
    external_reference: `seed:${studentIdentifier}`,
    checked_at: daysFromNow(-30),
  });
}

async function nextMemberNumber(knex, clubId, prefix) {
  const [club] = await knex('clubs').where({ id: clubId }).forUpdate().select('next_member_seq', 'member_number_prefix');
  const seq = club.next_member_seq;
  const p = prefix || club.member_number_prefix || 'SKY';
  await knex('clubs').where({ id: clubId }).update({ next_member_seq: seq + 1 });
  return `${p}-${String(seq).padStart(4, '0')}`;
}

async function ensureMembershipExpiringSoon(knex, { userId, club, plan, daysUntilExpiry }) {
  const expiresOn = addDaysToDate(todayIST(), daysUntilExpiry);
  const startsOn = startsOnForExpiry(expiresOn, plan.duration_months);

  let membership = await knex('memberships')
    .where({ user_id: userId, club_id: club.id })
    .whereIn('status', ['ACTIVE', 'EXPIRED'])
    .orderBy('created_at', 'desc')
    .first();

  if (!membership) {
    const memberNumber = await nextMemberNumber(knex, club.id, club.member_number_prefix);
    [membership] = await knex('memberships')
      .insert({
        user_id: userId,
        club_id: club.id,
        status: 'ACTIVE',
        member_number: memberNumber,
        current_plan_id: plan.id,
        started_on: startsOn,
        expires_on: expiresOn,
        qr_token: randomToken(16),
        autopay_enabled: false,
      })
      .returning('*');
    await knex('membership_terms').insert({
      membership_id: membership.id,
      club_id: club.id,
      user_id: userId,
      kind: 'JOIN',
      source: 'MANUAL',
      plan_id: plan.id,
      plan_name: plan.name,
      fee_paise: plan.fee_paise,
      duration_months: plan.duration_months,
      event_discount_bps: plan.event_discount_bps,
      merch_discount_bps: plan.merch_discount_bps,
      early_bird_access: plan.early_bird_access,
      benefits_text: plan.benefits_text ?? '',
      status: 'PAID',
      starts_on: startsOn,
      ends_on: expiresOn,
      paid_at: daysFromNow(-30, 12),
    });
  } else {
    await knex('memberships').where({ id: membership.id }).update({
      status: 'ACTIVE',
      current_plan_id: plan.id,
      started_on: startsOn,
      expires_on: expiresOn,
      autopay_enabled: false,
      updated_at: knex.fn.now(),
    });
    await knex('membership_terms').where({ membership_id: membership.id, status: 'PAID' }).update({
      ends_on: expiresOn,
      starts_on: startsOn,
    });
    const hasPaidTerm = await knex('membership_terms')
      .where({ membership_id: membership.id, status: 'PAID', ends_on: expiresOn })
      .first();
    if (!hasPaidTerm) {
      await knex('membership_terms').insert({
        membership_id: membership.id,
        club_id: club.id,
        user_id: userId,
        kind: 'RENEWAL',
        source: 'MANUAL',
        plan_id: plan.id,
        plan_name: plan.name,
        fee_paise: plan.fee_paise,
        duration_months: plan.duration_months,
        event_discount_bps: plan.event_discount_bps,
        merch_discount_bps: plan.merch_discount_bps,
        early_bird_access: plan.early_bird_access,
        benefits_text: plan.benefits_text ?? '',
        status: 'PAID',
        starts_on: startsOn,
        ends_on: expiresOn,
        paid_at: daysFromNow(-30, 12),
      });
    }
  }

  await knex('membership_terms')
    .where({ membership_id: membership.id })
    .where('starts_on', '>', expiresOn)
    .del();

  await knex('college_student_roster')
    .where({ linked_user_id: userId })
    .update({ linked_user_id: userId, updated_at: knex.fn.now() });

  return { membershipId: membership.id, expiresOn };
}

export async function seed(knex) {
  const sky = await knex('clubs').where({ slug: 'skyline' }).first();
  if (!sky) {
    // eslint-disable-next-line no-console
    console.log('[seed] 005_renewal_reminder_test_users skipped — no skyline club');
    return;
  }
  const plan = await knex('membership_plans')
    .where({ club_id: sky.id, name: 'Semester', status: 'ACTIVE' })
    .first();
  if (!plan) {
    // eslint-disable-next-line no-console
    console.log('[seed] 005 skipped — no Semester plan');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await knex.transaction(async (trx) => {
    for (const spec of RENEWAL_TEST_USERS) {
      await upsertRoster(trx, {
        studentIdentifier: spec.studentIdentifier,
        fullName: spec.fullName,
        collegeEmail: spec.email.includes('@skyline.ac.in') ? spec.email : null,
      });

      let user = await trx('users').whereRaw('lower(email) = ?', [spec.email.toLowerCase()]).first();
      if (!user) {
        user = await insertUser(trx, {
          email: spec.email,
          fullName: spec.fullName,
          passwordHash,
          verified: true,
          studentIdentifier: spec.studentIdentifier,
        });
      } else {
        await trx('users').where({ id: user.id }).update({
          full_name: spec.fullName,
          password_hash: passwordHash,
          updated_at: trx.fn.now(),
        });
        await ensureVerified(trx, user.id, spec.studentIdentifier);
      }

      await trx('college_student_roster')
        .where({ student_identifier: spec.studentIdentifier })
        .update({ linked_user_id: user.id, updated_at: trx.fn.now() });

      const { membershipId, expiresOn } = await ensureMembershipExpiringSoon(trx, {
        userId: user.id,
        club: sky,
        plan,
        daysUntilExpiry: DAYS_UNTIL_EXPIRY,
      });

      // eslint-disable-next-line no-console
      console.log(`[seed] Renewal QA: ${spec.email} → Skyline membership ${membershipId} expires ${expiresOn}`);
    }
  });

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Run renewal reminders: login (curl -c jar.txt …/auth/login), then POST …/dev/jobs/renewal-reminders/run {"resend":true} with NOTIFY_MODE=smtp for real email.`,
  );
}
