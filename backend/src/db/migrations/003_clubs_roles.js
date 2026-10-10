/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('clubs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('slug').notNullable().unique();
    t.text('name').notNullable();
    t.text('description').notNullable().defaultTo('');
    t.text('contact_email').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.text('member_number_prefix').notNullable();
    t.integer('next_member_seq').notNullable().defaultTo(1);
    t.timestamps(true, true);
  });
  await knex.raw(`
    CREATE TRIGGER clubs_updated_at BEFORE UPDATE ON clubs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable('club_role_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('role').notNullable();
    t.uuid('assigned_by').nullable().references('id').inTable('users');
    t.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.uuid('revoked_by').nullable().references('id').inTable('users');
    t.check("role IN ('CLUB_HEAD','TREASURER','VOLUNTEER')", [], 'cra_role');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX cra_active_role ON club_role_assignments (club_id, user_id, role)
      WHERE revoked_at IS NULL;
    CREATE INDEX cra_user_active ON club_role_assignments (user_id) WHERE revoked_at IS NULL;
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('club_role_assignments');
  await knex.schema.dropTableIfExists('clubs');
}
