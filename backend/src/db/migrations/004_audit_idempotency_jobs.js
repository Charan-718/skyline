/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('actor_user_id').nullable().references('id').inTable('users');
    t.uuid('club_id').nullable().references('id').inTable('clubs');
    t.text('action').notNullable();
    t.text('entity_type').notNullable();
    t.uuid('entity_id').nullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.text('request_id').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    CREATE INDEX audit_logs_club_created ON audit_logs (club_id, created_at DESC);
    CREATE INDEX audit_logs_entity ON audit_logs (entity_type, entity_id);
    CREATE TRIGGER audit_logs_no_mutate BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
  `);

  await knex.schema.createTable('idempotency_keys', (t) => {
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('key').notNullable();
    t.text('method').notNullable();
    t.text('path').notNullable();
    t.text('request_hash').notNullable();
    t.integer('status_code').nullable();
    t.jsonb('response_body').nullable();
    t.timestamp('locked_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.primary(['user_id', 'key']);
  });
  await knex.raw('CREATE INDEX idempotency_keys_expires ON idempotency_keys (expires_at)');

  await knex.schema.createTable('job_runs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('job_name').notNullable();
    t.text('run_key').notNullable();
    t.text('status').notNullable();
    t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('finished_at', { useTz: true }).nullable();
    t.jsonb('summary').nullable();
    t.text('error').nullable();
    t.check("status IN ('RUNNING','SUCCEEDED','FAILED')", [], 'job_runs_status');
    t.unique(['job_name', 'run_key']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('job_runs');
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('audit_logs');
}
