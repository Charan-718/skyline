// LLD §3.5 #11 — budgets, expenses, financial_transactions (+ ledger immutability trigger).
// Whole file ships in T-32 (OQ-03 APPROVED); expense/budget code lands in T-81/T-82.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE budgets (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id      uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      name         text NOT NULL,
      period_start date NOT NULL,
      period_end   date NOT NULL CHECK (period_end >= period_start),
      amount_paise bigint NOT NULL CHECK (amount_paise > 0),
      notes        text NULL,
      created_by   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER budgets_set_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE expenses (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id          uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      kind             text NOT NULL CHECK (kind IN ('REIMBURSEMENT', 'DIRECT')),
      title            text NOT NULL CHECK (length(title) <= 150),
      description      text NOT NULL DEFAULT '',
      amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
      incurred_on      date NOT NULL,
      event_id         uuid NULL REFERENCES events (id) ON DELETE RESTRICT,
      fundraiser_id    uuid NULL REFERENCES fundraisers (id) ON DELETE RESTRICT,
      receipt_file_id  uuid NOT NULL REFERENCES uploaded_files (id) ON DELETE RESTRICT,
      submitted_by     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      payee_user_id    uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      status           text NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID')),
      decided_by       uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      decided_at       timestamptz NULL,
      decision_note    text NULL,
      paid_by          uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      paid_at          timestamptz NULL,
      payout_reference text NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(event_id, fundraiser_id) <= 1),
      CHECK (kind <> 'REIMBURSEMENT' OR payee_user_id = submitted_by),
      CHECK (status NOT IN ('APPROVED', 'REJECTED') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
      CHECK (decided_by IS NULL OR kind = 'DIRECT' OR decided_by <> submitted_by),
      CHECK (status <> 'REJECTED' OR decision_note IS NOT NULL),
      CHECK (status <> 'PAID' OR (paid_by IS NOT NULL AND paid_at IS NOT NULL))
    );
    CREATE INDEX expenses_club_status_idx ON expenses (club_id, status);
    CREATE INDEX expenses_submitted_by_idx ON expenses (submitted_by);
    CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE financial_transactions (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id          uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      direction        text NOT NULL CHECK (direction IN ('IN', 'OUT')),
      category         text NOT NULL,
      amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
      currency         char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
      status           text NOT NULL DEFAULT 'POSTED' CHECK (status = 'POSTED'),
      source_type      text NOT NULL CHECK (source_type IN ('PAYMENT', 'EXPENSE', 'INCOME_ENTRY')),
      source_id        uuid NOT NULL,
      payment_id       uuid NULL REFERENCES payments (id) ON DELETE RESTRICT,
      expense_id       uuid NULL REFERENCES expenses (id) ON DELETE RESTRICT,
      event_id         uuid NULL REFERENCES events (id) ON DELETE RESTRICT,
      fundraiser_id    uuid NULL REFERENCES fundraisers (id) ON DELETE RESTRICT,
      membership_id    uuid NULL REFERENCES memberships (id) ON DELETE RESTRICT,
      order_id         uuid NULL REFERENCES orders (id) ON DELETE RESTRICT,
      payer_user_id    uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      recorded_by      uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      approved_by      uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      description      text NOT NULL,
      reference        text NULL,
      evidence_file_id uuid NULL REFERENCES uploaded_files (id) ON DELETE RESTRICT,
      occurred_at      timestamptz NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT financial_transactions_source_uq UNIQUE (source_type, source_id),
      CONSTRAINT financial_transactions_category_chk CHECK (
        (direction = 'IN' AND category IN ('MEMBERSHIP_DUES', 'MEMBERSHIP_RENEWAL', 'TICKET_SALE', 'MERCH_SALE', 'FUNDRAISER_INCOME'))
        OR (direction = 'OUT' AND category IN ('REIMBURSEMENT_PAYOUT', 'DIRECT_EXPENSE'))
      ),
      CHECK (source_type <> 'PAYMENT' OR (payment_id = source_id)),
      CHECK (source_type <> 'EXPENSE' OR (expense_id = source_id))
    );
    CREATE INDEX financial_transactions_club_occurred_idx ON financial_transactions (club_id, occurred_at DESC);
    CREATE INDEX financial_transactions_club_category_idx ON financial_transactions (club_id, category);
    CREATE INDEX financial_transactions_event_idx ON financial_transactions (event_id);
    CREATE INDEX financial_transactions_fundraiser_idx ON financial_transactions (fundraiser_id);
    CREATE TRIGGER forbid_update_delete BEFORE UPDATE OR DELETE ON financial_transactions
      FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE financial_transactions;
    DROP TABLE expenses;
    DROP TABLE budgets;
  `);
}
