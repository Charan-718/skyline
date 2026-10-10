/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('announcements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('event_id').nullable().references('id').inTable('events');
    t.text('title').notNullable();
    t.text('body').notNullable();
    t.text('category').notNullable();
    t.text('audience').notNullable();
    t.boolean('send_email').notNullable().defaultTo(true);
    t.text('status').notNullable().defaultTo('DRAFT');
    t.uuid('created_by').notNullable().references('id').inTable('users');
    t.uuid('published_by').nullable().references('id').inTable('users');
    t.timestamp('published_at', { useTz: true }).nullable();
    t.timestamps(true, true);
    t.check('length(body) <= 5000', [], 'ann_body');
    t.check("category IN ('MEETING','DEADLINE','EVENT','SCHEDULE_CHANGE','GENERAL')", [], 'ann_cat');
    t.check("audience IN ('PUBLIC','MEMBERS')", [], 'ann_aud');
    t.check("status IN ('DRAFT','PUBLISHED')", [], 'ann_status');
    t.check("(status = 'PUBLISHED') = (published_at IS NOT NULL AND published_by IS NOT NULL)", [], 'ann_pub');
  });
  await knex.raw(`
    CREATE INDEX ann_club_published ON announcements (club_id, published_at DESC) WHERE status = 'PUBLISHED';
    CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE OR REPLACE FUNCTION announcements_published_immutable()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'published announcements are immutable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER announcements_no_edit_published BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION announcements_published_immutable();
  `);

  await knex.schema.createTable('notification_deliveries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').nullable().references('id').inTable('clubs');
    t.uuid('recipient_user_id').notNullable().references('id').inTable('users');
    t.text('channel').notNullable();
    t.text('template').notNullable();
    t.uuid('announcement_id').nullable().references('id').inTable('announcements');
    t.text('destination').nullable();
    t.jsonb('payload').notNullable();
    t.text('status').notNullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('next_attempt_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text('last_error').nullable();
    t.text('provider').nullable();
    t.text('provider_message_id').nullable();
    t.text('dedupe_key').notNullable().unique();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('sent_at', { useTz: true }).nullable();
    t.timestamp('claimed_at', { useTz: true }).nullable();
    t.check("channel IN ('EMAIL','WHATSAPP')", [], 'nd_channel');
    t.check("template IN ('ANNOUNCEMENT','RENEWAL_REMINDER_7D','AUTOPAY_RESULT','BOOKING_CONFIRMED','LOW_STOCK_ALERT')", [], 'nd_template');
    t.check("status IN ('PENDING','SENDING','SENT','FAILED','SKIPPED')", [], 'nd_status');
  });
  await knex.raw(`
    CREATE INDEX nd_pending_next ON notification_deliveries (status, next_attempt_at) WHERE status = 'PENDING';
    CREATE INDEX nd_announcement ON notification_deliveries (announcement_id, status);
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('notification_deliveries');
  await knex.raw('DROP TRIGGER IF EXISTS announcements_no_edit_published ON announcements');
  await knex.raw('DROP FUNCTION IF EXISTS announcements_published_immutable()');
  await knex.schema.dropTableIfExists('announcements');
}
