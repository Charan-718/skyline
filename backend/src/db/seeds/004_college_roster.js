import { runCollegeRosterSeed } from './lib/collegeRosterSeed.js';

/**
 * College student roster for verification (runs after engagement + volume seeds).
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  await runCollegeRosterSeed(knex);
}
