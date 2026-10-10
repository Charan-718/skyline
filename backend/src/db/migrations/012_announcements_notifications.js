// LLD §3.5 #12 — announcements (columns defined by Group 1, file applied by Group 2) and
// notification_deliveries (outbox), + published-immutability trigger.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE announcements (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id      uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      event_id     uuid NULL REFERENCES events (id) ON DELETE RESTRICT,
      title        text NOT NULL CHECK (length(title) <= 150),
      body         text NOT NULL CHECK (length(body) <= 5000),
      category     text NOT NULL CHECK (category IN ('MEETING', 'DEADLINE', 'EVENT', 'SCHEDULE_CHANGE', 'GENERAL')),
      audience     text NOT NULL CHECK (audience IN ('PUBLIC', 'MEMBERS')),
      send_email   boolean NOT NULL DEFAULT true,
      status       text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED')),
      created_by   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      published_by uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      published_at timestamptz NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL AND published_by IS NOT NULL))
    );
    CREATE INDEX announcements_club_published_idx ON announcements (club_id, published_at DESC) WHERE status = 'PUBLISHED';
    CREATE INDEX announcements_audience_published_idx ON announcements (audience, published_at DESC);
    CREATE TRIGGER announcements_set_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    -- A published announcement is the record of what was said and when: no UPDATE or DELETE.
    CREATE OR REPLACE FUNCTION forbid_published_announcement_change() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION '% of a published announcement is not allowed', TG_OP USING ERRCODE = 'restrict_violation';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
    $fn$;
    CREATE TRIGGER announcements_published_immutable BEFORE UPDATE OR DELETE ON announcements
      FOR EACH ROW EXECUTE FUNCTION forbid_published_announcement_change();

    CREATE TABLE notification_deliveries (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id             uuid NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      recipient_user_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      channel             text NOT NULL CHECK (channel IN ('EMAIL', 'WHATSAPP')),
      template            text NOT NULL CHECK (template IN ('ANNOUNCEMENT', 'RENEWAL_REMINDER_7D', 'AUTOPAY_RESULT', 'BOOKING_CONFIRMED', 'LOW_STOCK_ALERT')),
      announcement_id     uuid NULL REFERENCES announcements (id) ON DELETE RESTRICT,
      destination         text NULL,
      payload             jsonb NOT NULL,
      status              text NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
      attempts            int NOT NULL DEFAULT 0,
      next_attempt_at     timestamptz NOT NULL DEFAULT now(),
      last_error          text NULL,
      provider            text NULL,
      provider_message_id text NULL,
      dedupe_key          text UNIQUE NOT NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      sent_at             timestamptz NULL,
      claimed_at          timestamptz NULL
    );
    CREATE INDEX notification_deliveries_due_idx ON notification_deliveries (status, next_attempt_at) WHERE status = 'PENDING';
    CREATE INDEX notification_deliveries_announcement_idx ON notification_deliveries (announcement_id, status);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE notification_deliveries;
    DROP TABLE announcements;
    DROP FUNCTION forbid_published_announcement_change();
  `);
}
