import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group2MigrationSource } from './src/db/migrationSource.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Group 1 owns these migrations (LLD §3.5). They are skipped when GROUP1_SCHEMA is
// `fixture` (tests, dev Compose) or `external`.
// TODO(group1): delete when Group 1 merges — the list and the fixture switch go away.
export const group1Migrations = [
  '002_users_sessions_verifications',
  '003_clubs_roles',
  '006_membership_plans_memberships_terms_autopay',
  '007_events_organizers_staff_bookings_tickets_checkins',
];

export function migrationConfig(mode = process.env.GROUP1_SCHEMA ?? 'migrations') {
  return {
    tableName: 'knex_migrations',
    migrationSource: new Group2MigrationSource({
      directory: path.join(here, 'src/db/migrations'),
      mode,
      group1Migrations,
      fixturePath: path.join(here, 'tests/fixtures/group1_schema.sql'),
    }),
  };
}

export default {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 5 },
  migrations: migrationConfig(),
};
