// Email is the only notification channel. 012 is not edited (migrations are append-only); this
// narrows nd_channel and drops outbox rows of retired channels (none are ever sent). The numbering
// leaves room for 014/015, which live on feat/grp2_transaction.
export async function up(knex) {
  await knex.raw("DELETE FROM notification_deliveries WHERE channel <> 'EMAIL'");
  await knex.raw('ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS nd_channel');
  await knex.raw("ALTER TABLE notification_deliveries ADD CONSTRAINT nd_channel CHECK (channel = 'EMAIL')");
}

export async function down(knex) {
  await knex.raw('ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS nd_channel');
  await knex.raw("ALTER TABLE notification_deliveries ADD CONSTRAINT nd_channel CHECK (channel IN ('EMAIL','WHATSAPP'))");
}
