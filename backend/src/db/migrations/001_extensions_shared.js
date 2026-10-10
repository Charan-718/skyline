// LLD §3.5 #1 — pgcrypto, set_updated_at(), forbid_update_delete().

export async function up(knex) {
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $fn$;

    -- Append-only tables (audit_logs, financial_transactions) attach this as
    -- BEFORE UPDATE OR DELETE ... FOR EACH ROW.
    CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
    END;
    $fn$;
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP FUNCTION IF EXISTS forbid_update_delete();
    DROP FUNCTION IF EXISTS set_updated_at();
  `);
  // pgcrypto is left installed: other databases objects or tools may depend on it, and
  // CREATE EXTENSION IF NOT EXISTS makes re-running up safe.
}
