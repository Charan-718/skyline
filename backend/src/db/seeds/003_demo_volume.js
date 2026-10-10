import { runDemoVolumeSeed } from './lib/demoVolumeSeed.js';

/** Adds ~100-row-scale demo data for dashboards/reports (requires 002 / club skyline). */
export async function seed(knex) {
  await runDemoVolumeSeed(knex);
}
