import { describe, expect, it } from 'vitest';
import { group1Migrations, migrationConfig } from '../../knexfile.js';
import { GROUP1_FIXTURE_MIGRATION } from '../../src/db/migrationSource.js';

const names = async (mode) => (await migrationConfig(mode).migrationSource.getMigrations()).map((m) => m.name);

describe('migration source and GROUP1_SCHEMA switch (OQ-01)', () => {
  it('lists Group 2 migrations in LLD §3.5 order with the fixture right after 001 in fixture mode', async () => {
    expect(await names('fixture')).toEqual([
      '001_extensions_shared.js',
      GROUP1_FIXTURE_MIGRATION,
      '004_audit_idempotency_jobs.js',
      '005_uploaded_files.js',
      '008_merch_catalogue_variants_stock_alerts_orders_items.js',
      '009_payments.js',
      '010_fundraisers_tasks.js',
      '011_budgets_expenses_ledger.js',
      '012_announcements_notifications.js',
    ]);
  });

  it('external mode skips Group 1 migrations and applies no fixture', async () => {
    const list = await names('external');
    expect(list).not.toContain(GROUP1_FIXTURE_MIGRATION);
    for (const g1 of group1Migrations) expect(list).not.toContain(`${g1}.js`);
  });

  it('migrations mode runs every file in the directory (Group 1 files included once they exist)', async () => {
    const list = await names('migrations');
    expect(list).not.toContain(GROUP1_FIXTURE_MIGRATION);
    expect(list[0]).toBe('001_extensions_shared.js');
  });

  it('lists exactly the four Group 1 migrations from LLD §3.5', () => {
    expect(group1Migrations).toEqual([
      '002_users_sessions_verifications',
      '003_clubs_roles',
      '006_membership_plans_memberships_terms_autopay',
      '007_events_organizers_staff_bookings_tickets_checkins',
    ]);
  });

  it('rejects unknown modes', () => {
    expect(() => migrationConfig('bogus')).toThrow(/GROUP1_SCHEMA/);
  });
});
