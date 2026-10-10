// LLD §3.5 #10 — fundraisers and tasks. Schema only in Step 2 (OQ-27): expenses (011)
// reference fundraisers. Code lands in T-70/T-71.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE fundraisers (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id           uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      name              text NOT NULL,
      description       text NOT NULL DEFAULT '',
      starts_on         date NOT NULL,
      target_date       date NOT NULL CHECK (target_date >= starts_on),
      goal_amount_paise bigint NULL CHECK (goal_amount_paise > 0),
      status            text NOT NULL CHECK (status IN ('PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
      created_by        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      completed_at      timestamptz NULL,
      UNIQUE (id, club_id)
    );
    CREATE TRIGGER fundraisers_set_updated_at BEFORE UPDATE ON fundraisers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE fundraiser_tasks (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      fundraiser_id    uuid NOT NULL,
      club_id          uuid NOT NULL,
      title            text NOT NULL CHECK (length(title) <= 150),
      description      text NOT NULL DEFAULT '',
      assignee_user_id uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      deadline         timestamptz NOT NULL,
      status           text NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
      progress_percent int NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
      created_by       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now(),
      completed_at     timestamptz NULL,
      CHECK (status <> 'DONE' OR progress_percent = 100),
      FOREIGN KEY (fundraiser_id, club_id) REFERENCES fundraisers (id, club_id) ON DELETE RESTRICT
    );
    CREATE INDEX fundraiser_tasks_fundraiser_status_idx ON fundraiser_tasks (fundraiser_id, status);
    CREATE INDEX fundraiser_tasks_assignee_status_idx ON fundraiser_tasks (assignee_user_id, status);
    CREATE TRIGGER fundraiser_tasks_set_updated_at BEFORE UPDATE ON fundraiser_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE fundraiser_tasks;
    DROP TABLE fundraisers;
  `);
}
