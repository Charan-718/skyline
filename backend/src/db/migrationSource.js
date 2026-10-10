import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Lists migrations in LLD §3.5 order and applies the Group 1 schema switch (OQ-01):
//   GROUP1_SCHEMA=migrations  run every file in the directory, Group 1's included (default)
//   GROUP1_SCHEMA=fixture     skip Group 1's files; apply tests/fixtures/group1_schema.sql after 001
//   GROUP1_SCHEMA=external    skip Group 1's files; their tables already exist
// TODO(group1): delete the fixture branch when Group 1 merges.

export const GROUP1_FIXTURE_MIGRATION = '001_group1_fixture.sql';

// Reverse dependency order for the fixture's down (Group 2 tables are already gone by then).
export const GROUP1_FIXTURE_TABLES = [
  'check_ins',
  'tickets',
  'bookings',
  'event_staff',
  'event_organizers',
  'events',
  'renewal_attempts',
  'autopay_consents',
  'membership_terms',
  'memberships',
  'membership_plans',
  'club_role_assignments',
  'clubs',
  'college_verifications',
  'user_sessions',
  'users',
];

const stripExt = (file) => file.replace(/\.js$/, '');

export class Group2MigrationSource {
  constructor({ directory, mode = 'migrations', group1Migrations = [], fixturePath }) {
    if (!['migrations', 'fixture', 'external'].includes(mode)) throw new Error(`Unknown GROUP1_SCHEMA: ${mode}`);
    this.directory = directory;
    this.mode = mode;
    this.group1 = new Set(group1Migrations.map(stripExt));
    this.fixturePath = fixturePath;
  }

  async getMigrations() {
    const files = (await readdir(this.directory)).filter((f) => /^\d{3}_.+\.js$/.test(f)).sort();
    const kept = this.mode === 'migrations' ? files : files.filter((f) => !this.group1.has(stripExt(f)));
    const list = kept.map((file) => ({ name: file, file: path.join(this.directory, file) }));
    if (this.mode === 'fixture') {
      const at = list.findIndex((m) => m.name.startsWith('001_'));
      list.splice(at + 1, 0, { name: GROUP1_FIXTURE_MIGRATION, fixture: true });
    }
    return list;
  }

  getMigrationName(migration) {
    return migration.name;
  }

  async getMigration(migration) {
    if (migration.fixture) {
      const fixturePath = this.fixturePath;
      return {
        async up(knex) {
          await knex.raw(await readFile(fixturePath, 'utf8'));
        },
        async down(knex) {
          await knex.raw(`DROP TABLE IF EXISTS ${GROUP1_FIXTURE_TABLES.join(', ')}`);
        },
      };
    }
    return import(pathToFileURL(migration.file).href);
  }
}
