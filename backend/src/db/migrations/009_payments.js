// G2-STUB: minimal payments table for Group 1 integration; Group 2 may extend.
/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('purpose').notNullable();
    t.uuid('membership_term_id').nullable().references('id').inTable('membership_terms');
    t.uuid('booking_id').nullable().references('id').inTable('bookings');
    t.uuid('order_id').nullable();
    t.bigInteger('amount_paise').notNullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.text('method').notNullable();
    t.boolean('is_simulated').notNullable().defaultTo(true);
    t.text('status').notNullable();
    t.text('reference').notNullable().unique();
    t.text('failure_reason').nullable();
    t.timestamps(true, true);
    t.timestamp('settled_at', { useTz: true }).nullable();
    t.check('amount_paise > 0', [], 'pay_amount');
    t.check("purpose IN ('MEMBERSHIP_JOIN','MEMBERSHIP_RENEWAL','EVENT_TICKET','MERCH_ORDER')", [], 'pay_purpose');
    t.check("method IN ('SIMULATED','SIMULATED_AUTOPAY')", [], 'pay_method');
    t.check("status IN ('INITIATED','PENDING','SUCCEEDED','FAILED','EXPIRED')", [], 'pay_status');
    t.check('is_simulated = true', [], 'pay_sim');
    t.check('num_nonnulls(membership_term_id, booking_id, order_id) = 1', [], 'pay_target');
    t.check("currency = 'INR'", [], 'pay_currency');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX pay_live_booking ON payments (booking_id)
      WHERE booking_id IS NOT NULL AND status IN ('INITIATED','PENDING','SUCCEEDED');
    CREATE UNIQUE INDEX pay_live_term ON payments (membership_term_id)
      WHERE membership_term_id IS NOT NULL AND status IN ('INITIATED','PENDING','SUCCEEDED');
    CREATE INDEX pay_club_created ON payments (club_id, created_at DESC);
    CREATE INDEX pay_user_created ON payments (user_id, created_at DESC);
    CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ALTER TABLE renewal_attempts
      ADD CONSTRAINT renewal_attempts_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES payments(id);
  `);
}

export async function down(knex) {
  await knex.raw('ALTER TABLE renewal_attempts DROP CONSTRAINT IF EXISTS renewal_attempts_payment_id_fkey');
  await knex.schema.dropTableIfExists('payments');
}
