// LLD §3.5 #9 — payments (simulated only) + FK renewal_attempts.payment_id (OQ-04).

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE payments (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id            uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      user_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      purpose            text NOT NULL CHECK (purpose IN ('MEMBERSHIP_JOIN', 'MEMBERSHIP_RENEWAL', 'EVENT_TICKET', 'MERCH_ORDER')),
      membership_term_id uuid NULL REFERENCES membership_terms (id) ON DELETE RESTRICT,
      booking_id         uuid NULL REFERENCES bookings (id) ON DELETE RESTRICT,
      order_id           uuid NULL REFERENCES orders (id) ON DELETE RESTRICT,
      amount_paise       bigint NOT NULL CHECK (amount_paise > 0),
      currency           char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
      method             text NOT NULL CHECK (method IN ('SIMULATED', 'SIMULATED_AUTOPAY')),
      is_simulated       boolean NOT NULL DEFAULT true CHECK (is_simulated),
      status             text NOT NULL CHECK (status IN ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED')),
      reference          text UNIQUE NOT NULL,
      failure_reason     text NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      settled_at         timestamptz NULL,
      CONSTRAINT payments_one_target_chk CHECK (num_nonnulls(membership_term_id, booking_id, order_id) = 1)
    );
    CREATE UNIQUE INDEX payments_live_booking_uq ON payments (booking_id)
      WHERE status IN ('INITIATED', 'PENDING', 'SUCCEEDED');
    CREATE UNIQUE INDEX payments_live_order_uq ON payments (order_id)
      WHERE status IN ('INITIATED', 'PENDING', 'SUCCEEDED');
    CREATE UNIQUE INDEX payments_live_membership_term_uq ON payments (membership_term_id)
      WHERE status IN ('INITIATED', 'PENDING', 'SUCCEEDED');
    CREATE INDEX payments_club_created_idx ON payments (club_id, created_at DESC);
    CREATE INDEX payments_user_created_idx ON payments (user_id, created_at DESC);
    CREATE INDEX payments_open_status_created_idx ON payments (status, created_at)
      WHERE status IN ('INITIATED', 'PENDING');
    CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    ALTER TABLE renewal_attempts
      ADD CONSTRAINT renewal_attempts_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT;
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE renewal_attempts DROP CONSTRAINT renewal_attempts_payment_id_fkey;
    DROP TABLE payments;
  `);
}
