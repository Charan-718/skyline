import knexFactory from 'knex';
import { createDb } from '../../src/db/knex.js';
import { migrationConfig } from '../../knexfile.js';

// Test database helpers (LLD §10): soms_test is rebuilt from scratch once per run
// (globalSetup) and truncated per test file.

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see docker-compose.yml)');
  if (!/\/soms_test(\?|$)/.test(url) && !/_test(\?|$)/.test(url)) {
    throw new Error('Refusing to run tests against a database whose name does not end in _test');
  }
  return url;
}

export function createTestDb({ url = testDatabaseUrl(), poolMax = 25 } = {}) {
  return createDb({ databaseUrl: url, poolMax });
}

export async function resetSchema(db) {
  await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
  await db.raw('CREATE SCHEMA public');
}

export async function migrateLatest(db, mode = 'fixture') {
  return db.migrate.latest(migrationConfig(mode));
}

export async function rollbackAll(db, mode = 'fixture') {
  return db.migrate.rollback(migrationConfig(mode), true);
}

export async function truncateAll(db) {
  const { rows } = await db.raw(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'knex_migrations%'`,
  );
  if (!rows.length) return;
  // TRUNCATE does not fire the row-level append-only triggers.
  await db.raw(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Admin connection to the server's maintenance database, for creating scratch databases. */
export function createAdminDb(url = testDatabaseUrl()) {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  return knexFactory({ client: 'pg', connection: admin.toString(), pool: { min: 0, max: 1 } });
}
