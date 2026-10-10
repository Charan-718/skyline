import { createTestDb, migrateLatest, resetSchema } from './testDb.js';

// Runs once per `vitest run`: fresh schema, every migration (Group 1 tables from the fixture).
export default async function setup() {
  // `npm run lint:money` runs the pure grep test without a database.
  if (process.env.SKIP_DB_SETUP === '1') return;
  const db = createTestDb({ poolMax: 2 });
  try {
    await resetSchema(db);
    await migrateLatest(db, 'fixture');
  } finally {
    await db.destroy();
  }
}
