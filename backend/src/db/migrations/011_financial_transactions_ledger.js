// G2-STUB: ledger table only (expenses/budgets owned by G2 in full 011 migration).
/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('financial_transactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('club_id').notNullable().references('id').inTable('clubs');
    t.text('direction').notNullable();
    t.text('category').notNullable();
    t.bigInteger('amount_paise').notNullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.text('status').notNullable().defaultTo('POSTED');
    t.text('source_type').notNullable();
    t.uuid('source_id').notNullable();
    t.uuid('payment_id').nullable().references('id').inTable('payments');
    t.uuid('expense_id').nullable();
    t.uuid('event_id').nullable().references('id').inTable('events');
    t.uuid('fundraiser_id').nullable();
    t.uuid('membership_id').nullable().references('id').inTable('memberships');
    t.uuid('order_id').nullable();
    t.uuid('payer_user_id').nullable().references('id').inTable('users');
    t.uuid('recorded_by').nullable().references('id').inTable('users');
    t.uuid('approved_by').nullable().references('id').inTable('users');
    t.text('description').notNullable();
    t.text('reference').nullable();
    t.uuid('evidence_file_id').nullable();
    t.timestamp('occurred_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['source_type', 'source_id']);
    t.check('amount_paise > 0', [], 'ft_amount');
    t.check("direction IN ('IN','OUT')", [], 'ft_dir');
    t.check("status = 'POSTED'", [], 'ft_status');
    t.check("source_type IN ('PAYMENT','EXPENSE','INCOME_ENTRY')", [], 'ft_source');
  });
  await knex.raw(`
    CREATE INDEX ft_club_occurred ON financial_transactions (club_id, occurred_at DESC);
    CREATE INDEX ft_event ON financial_transactions (event_id);
    CREATE TRIGGER financial_transactions_no_mutate BEFORE UPDATE OR DELETE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('financial_transactions');
}
