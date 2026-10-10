/**
 * Authoritative college student roster for verification (replaces JSON fixture in database mode).
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('college_student_roster', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('student_identifier').notNullable();
    t.text('full_name').notNullable();
    t.text('college_email').nullable();
    t.text('program').nullable();
    t.boolean('club_head_eligible').notNullable().defaultTo(false);
    t.uuid('linked_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.check('length(full_name) BETWEEN 2 AND 100', [], 'csr_full_name_len');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX college_student_roster_student_id_uq ON college_student_roster (student_identifier);
    CREATE UNIQUE INDEX college_student_roster_email_lower_uq
      ON college_student_roster (lower(college_email))
      WHERE college_email IS NOT NULL;
    CREATE INDEX college_student_roster_linked_user ON college_student_roster (linked_user_id)
      WHERE linked_user_id IS NOT NULL;
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('college_student_roster');
}
