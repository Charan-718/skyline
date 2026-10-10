// LLD §3.5 #4 — audit_logs (append-only), idempotency_keys, job_runs. FKs to users/clubs (Group 1).

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE audit_logs (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      club_id       uuid NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      action        text NOT NULL,
      entity_type   text NOT NULL,
      entity_id     uuid NULL,
      metadata      jsonb NOT NULL DEFAULT '{}',
      request_id    text NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_logs_club_created_idx ON audit_logs (club_id, created_at DESC);
    CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
    CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

    CREATE TABLE idempotency_keys (
      user_id       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      key           uuid NOT NULL,
      method        text NOT NULL,
      path          text NOT NULL,
      request_hash  text NOT NULL,
      status_code   int NULL,
      response_body jsonb NULL,
      locked_at     timestamptz NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      expires_at    timestamptz NOT NULL,
      PRIMARY KEY (user_id, key)
    );
    CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

    CREATE TABLE job_runs (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_name    text NOT NULL,
      run_key     text NOT NULL,
      status      text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
      started_at  timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz NULL,
      summary     jsonb NULL,
      error       text NULL,
      UNIQUE (job_name, run_key)
    );
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE job_runs;
    DROP TABLE idempotency_keys;
    DROP TABLE audit_logs;
  `);
}
