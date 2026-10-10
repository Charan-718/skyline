/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION forbid_update_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'updates and deletes are forbidden on %', TG_TABLE_NAME;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex) {
  await knex.raw('DROP FUNCTION IF EXISTS forbid_update_delete()');
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()');
}
