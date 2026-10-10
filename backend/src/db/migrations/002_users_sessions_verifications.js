/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('email').notNullable();
    t.text('full_name').notNullable();
    t.text('phone_e164').nullable();
    t.text('password_hash').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.check('length(full_name) BETWEEN 2 AND 100', [], 'users_full_name_len');
  });
  await knex.raw('CREATE UNIQUE INDEX users_email_lower ON users (lower(email))');

  await knex.schema.createTable('user_sessions', (t) => {
    t.string('sid', 255).primary();
    t.json('sess').notNullable();
    t.timestamp('expire', { precision: 6 }).notNullable().index();
  });

  await knex.schema.createTable('college_verifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('outcome').notNullable();
    t.text('student_identifier_hash').notNullable();
    t.text('adapter').notNullable();
    t.text('external_reference').nullable();
    t.timestamp('checked_at', { useTz: true }).notNullable();
    t.timestamp('superseded_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("outcome IN ('VERIFIED','NOT_VERIFIED','UNAVAILABLE')", [], 'cv_outcome');
  });
  await knex.raw(`
    CREATE INDEX college_verifications_user_checked ON college_verifications (user_id, checked_at DESC);
    CREATE UNIQUE INDEX college_verifications_verified_hash
      ON college_verifications (student_identifier_hash)
      WHERE outcome = 'VERIFIED' AND superseded_at IS NULL;
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('college_verifications');
  await knex.schema.dropTableIfExists('user_sessions');
  await knex.schema.dropTableIfExists('users');
}
