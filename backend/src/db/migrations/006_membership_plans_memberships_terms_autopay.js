/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('membership_plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.text('name').notNullable();
    t.text('description').notNullable().defaultTo('');
    t.text('benefits_text').notNullable().defaultTo('');
    t.bigInteger('fee_paise').notNullable();
    t.integer('duration_months').notNullable();
    t.integer('event_discount_bps').notNullable().defaultTo(0);
    t.integer('merch_discount_bps').notNullable().defaultTo(0);
    t.boolean('early_bird_access').notNullable().defaultTo(false);
    t.text('status').notNullable().defaultTo('ACTIVE');
    t.uuid('created_by').nullable().references('id').inTable('users');
    t.timestamps(true, true);
    t.check('fee_paise >= 0', [], 'mp_fee');
    t.check('duration_months BETWEEN 1 AND 24', [], 'mp_duration');
    t.check('event_discount_bps BETWEEN 0 AND 10000', [], 'mp_ed');
    t.check('merch_discount_bps BETWEEN 0 AND 10000', [], 'mp_md');
    t.check("status IN ('ACTIVE','ARCHIVED')", [], 'mp_status');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX mp_club_name_active ON membership_plans (club_id, lower(name)) WHERE status = 'ACTIVE';
    CREATE INDEX mp_club_status ON membership_plans (club_id, status);
    CREATE TRIGGER membership_plans_updated_at BEFORE UPDATE ON membership_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable('memberships', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.text('status').notNullable();
    t.text('member_number').nullable();
    t.uuid('current_plan_id').nullable().references('id').inTable('membership_plans');
    t.date('started_on').nullable();
    t.date('expires_on').nullable();
    t.text('qr_token').notNullable().unique();
    t.boolean('autopay_enabled').notNullable().defaultTo(false);
    t.uuid('autopay_plan_id').nullable().references('id').inTable('membership_plans');
    t.bigInteger('autopay_amount_paise').nullable();
    t.timestamps(true, true);
    t.unique(['user_id', 'club_id']);
    t.unique(['club_id', 'member_number']);
    t.check("status IN ('PENDING_PAYMENT','ACTIVE','EXPIRED','CANCELLED')", [], 'm_status');
    t.check("(status <> 'ACTIVE') OR (expires_on IS NOT NULL)", [], 'm_active_expires');
    t.check('NOT autopay_enabled OR (autopay_plan_id IS NOT NULL AND autopay_amount_paise IS NOT NULL)', [], 'm_autopay');
  });
  await knex.raw(`
    CREATE INDEX memberships_club_status ON memberships (club_id, status);
    CREATE INDEX memberships_expires_active ON memberships (expires_on) WHERE status = 'ACTIVE';
    CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable('membership_terms', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('membership_id').notNullable().references('id').inTable('memberships');
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('kind').notNullable();
    t.text('source').notNullable().defaultTo('MANUAL');
    t.uuid('plan_id').notNullable().references('id').inTable('membership_plans');
    t.text('plan_name').notNullable();
    t.bigInteger('fee_paise').notNullable();
    t.integer('duration_months').notNullable();
    t.integer('event_discount_bps').notNullable();
    t.integer('merch_discount_bps').notNullable();
    t.boolean('early_bird_access').notNullable();
    t.text('benefits_text').notNullable().defaultTo('');
    t.text('status').notNullable();
    t.date('starts_on').nullable();
    t.date('ends_on').nullable();
    t.timestamp('paid_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("kind IN ('JOIN','RENEWAL')", [], 'mt_kind');
    t.check("source IN ('MANUAL','AUTOPAY')", [], 'mt_source');
    t.check("status IN ('PENDING_PAYMENT','PAID','FAILED')", [], 'mt_status');
    t.check('(status = \'PAID\') = (starts_on IS NOT NULL AND ends_on IS NOT NULL AND paid_at IS NOT NULL)', [], 'mt_paid');
    t.check('ends_on IS NULL OR ends_on >= starts_on', [], 'mt_dates');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX mt_one_pending ON membership_terms (membership_id) WHERE status = 'PENDING_PAYMENT';
    CREATE INDEX mt_membership_ends ON membership_terms (membership_id, ends_on DESC);
  `);

  await knex.schema.createTable('autopay_consents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('membership_id').notNullable().references('id').inTable('memberships');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('action').notNullable();
    t.uuid('plan_id').nullable().references('id').inTable('membership_plans');
    t.bigInteger('consented_amount_paise').nullable();
    t.text('consent_text_version').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("action IN ('ENABLED','DISABLED')", [], 'ac_action');
    t.check("action = 'DISABLED' OR (plan_id IS NOT NULL AND consented_amount_paise IS NOT NULL AND consent_text_version IS NOT NULL)", [], 'ac_enabled');
  });

  await knex.schema.createTable('renewal_attempts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('membership_id').notNullable().references('id').inTable('memberships');
    t.date('for_expires_on').notNullable();
    t.uuid('term_id').nullable().references('id').inTable('membership_terms');
    t.uuid('payment_id').nullable();
    t.text('status').notNullable();
    t.text('skip_reason').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.unique(['membership_id', 'for_expires_on']);
    t.check("status IN ('PROCESSING','SUCCEEDED','FAILED','PENDING','SKIPPED')", [], 'ra_status');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('renewal_attempts');
  await knex.schema.dropTableIfExists('autopay_consents');
  await knex.schema.dropTableIfExists('membership_terms');
  await knex.schema.dropTableIfExists('memberships');
  await knex.schema.dropTableIfExists('membership_plans');
}
