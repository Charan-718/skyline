import knex from 'knex';
import knexConfig from '../../knexfile.js';

let testDb;

export function getTestDb() {
  if (!testDb) {
    testDb = knex(knexConfig.test);
  }
  return testDb;
}

export async function migrateTestDb() {
  const db = getTestDb();
  await db.migrate.latest();
}

/** Truncate mutable tables between test files (keeps schema). */
export async function truncateTestDb() {
  const db = getTestDb();
  await db.raw(`
    TRUNCATE TABLE
      notification_deliveries, announcements, check_ins, tickets, bookings,
      event_staff, event_organizers, events, renewal_attempts, autopay_consents,
      membership_terms, memberships, membership_plans, payments, financial_transactions,
      idempotency_keys, audit_logs, job_runs, college_verifications,
      club_role_assignments, clubs, user_sessions, users
    RESTART IDENTITY CASCADE
  `);
}

export async function resetTestDb() {
  const db = getTestDb();
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
}

export async function destroyTestDb() {
  if (testDb) {
    await testDb.destroy();
    testDb = null;
  }
}
