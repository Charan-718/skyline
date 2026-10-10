-- TODO(group1): delete when Group 1 merges migrations 002, 003, 006 and 007.
--
-- Stand-in for the Group 1 tables that Group 2 migrations reference (OQ-01, APPROVED).
-- Columns, types, constraints and indexes are copied from LLD §3.1. Nothing else.
-- Applied by src/db/migrationSource.js in place of 002/003/006/007 when GROUP1_SCHEMA=fixture.
-- Requires 001_extensions_shared (pgcrypto, set_updated_at). The column list of every table
-- here is checked against LLD §3.1 by tests/integration/group1Fixture.drift.test.js.

-- ---------------------------------------------------------------- M1 (002)
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  full_name     text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  phone_e164    text NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_sessions (
  sid    varchar PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);

CREATE TABLE college_verifications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  outcome                 text NOT NULL CHECK (outcome IN ('VERIFIED', 'NOT_VERIFIED', 'UNAVAILABLE')),
  student_identifier_hash text NOT NULL,
  adapter                 text NOT NULL,
  external_reference      text NULL,
  checked_at              timestamptz NOT NULL,
  superseded_at           timestamptz NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX college_verifications_user_idx ON college_verifications (user_id, checked_at DESC);
CREATE UNIQUE INDEX college_verifications_verified_hash_uq ON college_verifications (student_identifier_hash)
  WHERE outcome = 'VERIFIED' AND superseded_at IS NULL;

-- ---------------------------------------------------------------- M2 (003)
CREATE TABLE clubs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text UNIQUE NOT NULL,
  name                 text NOT NULL,
  description          text NOT NULL DEFAULT '',
  contact_email        text NULL,
  is_active            boolean DEFAULT true,
  member_number_prefix text NOT NULL,
  next_member_seq      int NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER clubs_set_updated_at BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE club_role_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role        text NOT NULL CHECK (role IN ('CLUB_HEAD', 'TREASURER', 'VOLUNTEER')),
  assigned_by uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz NULL,
  revoked_by  uuid NULL REFERENCES users (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX club_role_assignments_active_uq ON club_role_assignments (club_id, user_id, role)
  WHERE revoked_at IS NULL;
CREATE INDEX club_role_assignments_user_idx ON club_role_assignments (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------- M3/M4 (006)
CREATE TABLE membership_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  name               text NOT NULL,
  description        text DEFAULT '',
  benefits_text      text DEFAULT '',
  fee_paise          bigint NOT NULL CHECK (fee_paise >= 0),
  duration_months    int NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
  event_discount_bps int DEFAULT 0 CHECK (event_discount_bps BETWEEN 0 AND 10000),
  merch_discount_bps int DEFAULT 0 CHECK (merch_discount_bps BETWEEN 0 AND 10000),
  early_bird_access  boolean DEFAULT false,
  status             text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by         uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX membership_plans_active_name_uq ON membership_plans (club_id, lower(name)) WHERE status = 'ACTIVE';
CREATE INDEX membership_plans_club_status_idx ON membership_plans (club_id, status);
CREATE TRIGGER membership_plans_set_updated_at BEFORE UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  club_id             uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  status              text NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  member_number       text NULL,
  current_plan_id     uuid NULL REFERENCES membership_plans (id) ON DELETE RESTRICT,
  started_on          date NULL,
  expires_on          date NULL,
  qr_token            text UNIQUE NOT NULL,
  autopay_enabled     boolean DEFAULT false,
  autopay_plan_id     uuid NULL REFERENCES membership_plans (id) ON DELETE RESTRICT,
  autopay_amount_paise bigint NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id),
  UNIQUE (club_id, member_number),
  CHECK (status <> 'ACTIVE' OR expires_on IS NOT NULL),
  CHECK (NOT autopay_enabled OR (autopay_plan_id IS NOT NULL AND autopay_amount_paise IS NOT NULL))
);
CREATE INDEX memberships_club_status_idx ON memberships (club_id, status);
CREATE INDEX memberships_active_expiry_idx ON memberships (expires_on) WHERE status = 'ACTIVE';
CREATE INDEX memberships_autopay_expiry_idx ON memberships (expires_on) WHERE autopay_enabled;
CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE membership_terms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id      uuid NOT NULL REFERENCES memberships (id) ON DELETE RESTRICT,
  club_id            uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind               text NOT NULL CHECK (kind IN ('JOIN', 'RENEWAL')),
  source             text NOT NULL CHECK (source IN ('MANUAL', 'AUTOPAY')),
  plan_id            uuid NOT NULL REFERENCES membership_plans (id) ON DELETE RESTRICT,
  plan_name          text NOT NULL,
  fee_paise          bigint NOT NULL,
  duration_months    int NOT NULL,
  event_discount_bps int NOT NULL,
  merch_discount_bps int NOT NULL,
  early_bird_access  boolean NOT NULL,
  benefits_text      text NOT NULL,
  status             text NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'FAILED')),
  starts_on          date NULL,
  ends_on            date NULL,
  paid_at            timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'PAID') = (starts_on IS NOT NULL AND ends_on IS NOT NULL AND paid_at IS NOT NULL)),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE UNIQUE INDEX membership_terms_pending_uq ON membership_terms (membership_id) WHERE status = 'PENDING_PAYMENT';
CREATE INDEX membership_terms_membership_idx ON membership_terms (membership_id, ends_on DESC);

CREATE TABLE autopay_consents (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id          uuid NOT NULL REFERENCES memberships (id) ON DELETE RESTRICT,
  user_id                uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action                 text NOT NULL CHECK (action IN ('ENABLED', 'DISABLED')),
  plan_id                uuid NULL REFERENCES membership_plans (id) ON DELETE RESTRICT,
  consented_amount_paise bigint NULL,
  consent_text_version   text NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (action = 'DISABLED' OR (plan_id IS NOT NULL AND consented_amount_paise IS NOT NULL AND consent_text_version IS NOT NULL))
);

-- payment_id FK → payments is added by Group 2 migration 009 (OQ-04).
CREATE TABLE renewal_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  uuid NOT NULL REFERENCES memberships (id) ON DELETE RESTRICT,
  for_expires_on date NOT NULL,
  term_id        uuid NULL REFERENCES membership_terms (id) ON DELETE RESTRICT,
  payment_id     uuid NULL,
  status         text NOT NULL CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED', 'PENDING', 'SKIPPED')),
  skip_reason    text NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz NULL,
  UNIQUE (membership_id, for_expires_on)
);

-- ---------------------------------------------------------------- M5 (007)
CREATE TABLE events (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                           uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  title                             text NOT NULL CHECK (length(title) <= 150),
  description                       text DEFAULT '',
  venue                             text NOT NULL,
  starts_at                         timestamptz NOT NULL,
  ends_at                           timestamptz NOT NULL,
  registration_opens_at             timestamptz NOT NULL,
  registration_closes_at            timestamptz NOT NULL,
  early_access_opens_at             timestamptz NULL,
  capacity                          int NOT NULL CHECK (capacity > 0),
  seats_reserved                    int NOT NULL DEFAULT 0,
  member_price_paise                bigint NOT NULL CHECK (member_price_paise >= 0),
  non_member_price_paise            bigint NULL CHECK (non_member_price_paise >= 0),
  member_discount_eligible          boolean DEFAULT true,
  early_bird_member_price_paise     bigint NULL,
  early_bird_non_member_price_paise bigint NULL,
  early_bird_ends_at                timestamptz NULL,
  early_bird_quantity               int NULL CHECK (early_bird_quantity > 0),
  early_bird_reserved               int NOT NULL DEFAULT 0,
  status                            text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED')),
  cancel_reason                     text NULL,
  created_by                        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  published_at                      timestamptz NULL,
  cancelled_at                      timestamptz NULL,
  completed_at                      timestamptz NULL,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_reserved BETWEEN 0 AND capacity),
  CHECK (early_bird_reserved >= 0 AND (early_bird_quantity IS NULL OR early_bird_reserved <= early_bird_quantity)),
  CHECK (registration_opens_at < registration_closes_at AND registration_closes_at <= starts_at AND starts_at < ends_at),
  CHECK (early_access_opens_at IS NULL OR early_access_opens_at < registration_opens_at),
  CHECK ((early_bird_member_price_paise IS NULL AND early_bird_non_member_price_paise IS NULL) OR early_bird_ends_at IS NOT NULL),
  CHECK (early_bird_non_member_price_paise IS NULL OR non_member_price_paise IS NOT NULL)
);
CREATE INDEX events_club_starts_idx ON events (club_id, starts_at);
CREATE INDEX events_status_starts_idx ON events (status, starts_at);
CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE event_organizers (
  event_id    uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_organizers_user_idx ON event_organizers (user_id);

CREATE TABLE event_staff (
  event_id    uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  club_id     uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_staff_user_idx ON event_staff (user_id);

CREATE TABLE bookings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  club_id            uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status             text NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  buyer_type         text NOT NULL CHECK (buyer_type IN ('MEMBER', 'NON_MEMBER')),
  price_tier         text NOT NULL CHECK (price_tier IN ('MEMBER_REGULAR', 'NON_MEMBER_REGULAR', 'MEMBER_EARLY_BIRD', 'NON_MEMBER_EARLY_BIRD', 'FREE')),
  list_price_paise   bigint NOT NULL CHECK (list_price_paise >= 0),
  discount_paise     bigint NOT NULL CHECK (discount_paise >= 0),
  final_price_paise  bigint NOT NULL CHECK (final_price_paise >= 0),
  pricing_mode       text NOT NULL CHECK (pricing_mode IN ('BEST_OF', 'STACK')),
  membership_term_id uuid NULL REFERENCES membership_terms (id) ON DELETE RESTRICT,
  uses_early_bird    boolean NOT NULL,
  hold_expires_at    timestamptz NULL,
  confirmed_at       timestamptz NULL,
  cancelled_at       timestamptz NULL,
  cancel_reason      text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (final_price_paise = list_price_paise - discount_paise)
);
CREATE UNIQUE INDEX bookings_live_uq ON bookings (event_id, user_id) WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED');
CREATE INDEX bookings_event_status_idx ON bookings (event_id, status);
CREATE INDEX bookings_hold_idx ON bookings (status, hold_expires_at) WHERE status = 'PENDING_PAYMENT';

CREATE TABLE tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid UNIQUE NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  event_id     uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  club_id      uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  ticket_code  text UNIQUE NOT NULL,
  qr_token     text UNIQUE NOT NULL,
  status       text NOT NULL CHECK (status IN ('VALID', 'USED', 'CANCELLED')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  used_at      timestamptz NULL,
  used_by      uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
  cancelled_at timestamptz NULL,
  CHECK ((status = 'USED') = (used_at IS NOT NULL AND used_by IS NOT NULL))
);
CREATE INDEX tickets_event_status_idx ON tickets (event_id, status);
CREATE INDEX tickets_user_idx ON tickets (user_id);

CREATE TABLE check_ins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid UNIQUE NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
  event_id      uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  checked_in_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  checked_in_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX check_ins_event_idx ON check_ins (event_id, checked_in_at);
