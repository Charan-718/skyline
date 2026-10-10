/**
 * College roster for dev is `students.mock.json` (mock college DB), not PostgreSQL.
 *
 * Verification is never pre-seeded: users become VERIFIED only when
 * POST /auth/register (college-domain email + roster match) or
 * POST /me/college-verification succeeds.
 *
 * @param {import('knex').Knex} _knex
 */
export async function seed(_knex) {
  // Intentionally empty — use register/login against the mock roster (see fixtures/README.md).
}
