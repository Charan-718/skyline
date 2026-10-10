/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.text('title').notNullable();
    t.text('description').notNullable().defaultTo('');
    t.text('venue').notNullable();
    t.timestamp('starts_at', { useTz: true }).notNullable();
    t.timestamp('ends_at', { useTz: true }).notNullable();
    t.timestamp('registration_opens_at', { useTz: true }).notNullable();
    t.timestamp('registration_closes_at', { useTz: true }).notNullable();
    t.timestamp('early_access_opens_at', { useTz: true }).nullable();
    t.integer('capacity').notNullable();
    t.integer('seats_reserved').notNullable().defaultTo(0);
    t.bigInteger('member_price_paise').notNullable();
    t.bigInteger('non_member_price_paise').nullable();
    t.boolean('member_discount_eligible').notNullable().defaultTo(true);
    t.bigInteger('early_bird_member_price_paise').nullable();
    t.bigInteger('early_bird_non_member_price_paise').nullable();
    t.timestamp('early_bird_ends_at', { useTz: true }).nullable();
    t.integer('early_bird_quantity').nullable();
    t.integer('early_bird_reserved').notNullable().defaultTo(0);
    t.text('status').notNullable().defaultTo('DRAFT');
    t.text('cancel_reason').nullable();
    t.uuid('created_by').notNullable().references('id').inTable('users');
    t.timestamp('published_at', { useTz: true }).nullable();
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.timestamps(true, true);
    t.check('capacity > 0', [], 'ev_cap');
    t.check('seats_reserved BETWEEN 0 AND capacity', [], 'ev_seats');
    t.check('early_bird_reserved >= 0', [], 'ev_ebr');
    t.check("status IN ('DRAFT','PUBLISHED','CANCELLED','COMPLETED')", [], 'ev_status');
  });
  await knex.raw(`
    CREATE INDEX events_club_starts ON events (club_id, starts_at);
    CREATE INDEX events_status_starts ON events (status, starts_at);
    CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable('event_organizers', (t) => {
    t.uuid('event_id').notNullable().references('id').inTable('events');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('assigned_by').notNullable().references('id').inTable('users');
    t.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['event_id', 'user_id']);
  });
  await knex.raw('CREATE INDEX event_organizers_user ON event_organizers (user_id)');

  await knex.schema.createTable('event_staff', (t) => {
    t.uuid('event_id').notNullable().references('id').inTable('events');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('assigned_by').notNullable().references('id').inTable('users');
    t.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['event_id', 'user_id']);
  });
  await knex.raw('CREATE INDEX event_staff_user ON event_staff (user_id)');

  await knex.schema.createTable('bookings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('event_id').notNullable().references('id').inTable('events');
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('status').notNullable();
    t.text('buyer_type').notNullable();
    t.text('price_tier').notNullable();
    t.bigInteger('list_price_paise').notNullable();
    t.bigInteger('discount_paise').notNullable();
    t.bigInteger('final_price_paise').notNullable();
    t.text('pricing_mode').notNullable();
    t.uuid('membership_term_id').nullable().references('id').inTable('membership_terms');
    t.boolean('uses_early_bird').notNullable();
    t.timestamp('hold_expires_at', { useTz: true }).nullable();
    t.timestamp('confirmed_at', { useTz: true }).nullable();
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.text('cancel_reason').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("status IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED')", [], 'bk_status');
    t.check("buyer_type IN ('MEMBER','NON_MEMBER')", [], 'bk_buyer');
    t.check('final_price_paise = list_price_paise - discount_paise', [], 'bk_price');
    t.check("pricing_mode IN ('BEST_OF','STACK')", [], 'bk_mode');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX bookings_live_user_event ON bookings (event_id, user_id)
      WHERE status IN ('PENDING_PAYMENT','CONFIRMED');
    CREATE INDEX bookings_event_status ON bookings (event_id, status);
    CREATE INDEX bookings_hold ON bookings (status, hold_expires_at) WHERE status = 'PENDING_PAYMENT';
  `);

  await knex.schema.createTable('tickets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('booking_id').notNullable().unique().references('id').inTable('bookings');
    t.uuid('event_id').notNullable().references('id').inTable('events');
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('ticket_code').notNullable().unique();
    t.text('qr_token').notNullable().unique();
    t.text('status').notNullable();
    t.timestamp('issued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('used_at', { useTz: true }).nullable();
    t.uuid('used_by').nullable().references('id').inTable('users');
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.check("status IN ('VALID','USED','CANCELLED')", [], 'tk_status');
    t.check("(status = 'USED') = (used_at IS NOT NULL AND used_by IS NOT NULL)", [], 'tk_used');
  });
  await knex.raw(`
    CREATE INDEX tickets_event_status ON tickets (event_id, status);
    CREATE INDEX tickets_user ON tickets (user_id);
  `);

  await knex.schema.createTable('check_ins', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('ticket_id').notNullable().unique().references('id').inTable('tickets');
    t.uuid('event_id').notNullable().references('id').inTable('events');
    t.uuid('checked_in_by').notNullable().references('id').inTable('users');
    t.timestamp('checked_in_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX check_ins_event_at ON check_ins (event_id, checked_in_at)');
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('check_ins');
  await knex.schema.dropTableIfExists('tickets');
  await knex.schema.dropTableIfExists('bookings');
  await knex.schema.dropTableIfExists('event_staff');
  await knex.schema.dropTableIfExists('event_organizers');
  await knex.schema.dropTableIfExists('events');
}
