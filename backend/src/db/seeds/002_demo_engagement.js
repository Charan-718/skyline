import { runDemoEngagementSeed } from './lib/demoEngagementSeed.js';

/**
 * Demo clubs, users, events, merch, finance — mirrors frontend mock seed for live API mode.
 *
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  await runDemoEngagementSeed(knex);
}
