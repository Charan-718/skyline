import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GROUP1_FIXTURE_TABLES } from '../../src/db/migrationSource.js';
import { createTestDb } from '../helpers/testDb.js';
import { lldPath } from '../helpers/lld.js';
import { lldTableColumns } from '../helpers/lldColumns.js';

// TODO(group1): delete with the fixture. Fails when tests/fixtures/group1_schema.sql drifts
// from LLD §3.1 (OQ-01, APPROVED).

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/group1_schema.sql');
const EXPECTED_TABLES = [
  'users', 'user_sessions', 'college_verifications', 'clubs', 'club_role_assignments', 'membership_plans',
  'memberships', 'membership_terms', 'autopay_consents', 'renewal_attempts', 'events', 'event_organizers',
  'event_staff', 'bookings', 'tickets', 'check_ins',
];

describe('Group 1 fixture vs LLD §3.1', () => {
  let db;
  const lld = readFileSync(lldPath(), 'utf8');
  beforeAll(() => {
    db = createTestDb({ poolMax: 2 });
  });
  afterAll(() => db.destroy());

  it('defines exactly the 16 Group 1 tables Group 2 references, and nothing else', () => {
    const created = [...readFileSync(fixturePath, 'utf8').matchAll(/^CREATE TABLE (\w+)/gm)].map((m) => m[1]);
    expect(created.sort()).toEqual([...EXPECTED_TABLES].sort());
    expect([...GROUP1_FIXTURE_TABLES].sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it.each(EXPECTED_TABLES)('%s columns match the LLD', async (table) => {
    const { rows } = await db.raw(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? ORDER BY column_name`,
      [table],
    );
    expect(rows.map((r) => r.column_name)).toEqual(lldTableColumns(lld, table));
  });
});
