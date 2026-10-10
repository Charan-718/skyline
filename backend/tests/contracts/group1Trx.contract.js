import { expect, it } from 'vitest';

// Contract for Group 1 lookups that Group 2 calls inside its own transactions (OQ-59 APPROVED):
//   auth.getUser(userId, { trx }?)            -> { id, fullName, email, phoneE164, isActive } | null
//   clubs.listRoleHolders(clubId, role, { trx }?) -> [{ userId }]
// When `trx` is given the implementation MUST run its queries on it:
//   - rows inserted (uncommitted) in the caller's transaction must be visible, and
//   - no second pool connection may be taken. The pool used here has max = 1, so an
//     implementation that ignores `trx` either misses the rows or waits forever (timeout).
//
// impl(db) -> { auth, clubs } builds the implementation under test on the given knex instance.

const TIMEOUT_MS = 3000;

function withinTimeout(promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${TIMEOUT_MS} ms — it is probably waiting for a second pool connection instead of using { trx }`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Runs the contract cases. `getDb()` returns a knex instance whose pool max is 1. */
export function group1TrxContract({ getDb, impl }) {
  async function insideRolledBackTransaction(fn) {
    const db = getDb();
    const sentinel = new Error('rollback');
    let result;
    await db
      .transaction(async (trx) => {
        result = await fn(trx, impl(db));
        throw sentinel;
      })
      .catch((err) => {
        if (err !== sentinel) throw err;
      });
    return result;
  }

  async function seed(trx) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const [user] = await trx('users')
      .insert({ email: `contract-${suffix}@example.test`, full_name: 'Contract User', phone_e164: '+919812345678', password_hash: 'x' })
      .returning('*');
    const [club] = await trx('clubs').insert({ slug: `contract-${suffix}`, name: 'Contract Club', member_number_prefix: 'CT' }).returning('*');
    await trx('club_role_assignments').insert({ club_id: club.id, user_id: user.id, role: 'CLUB_HEAD' });
    return { user, club };
  }

  it('auth.getUser(userId, { trx }) reads through the caller transaction (uncommitted user is visible)', async () => {
    const got = await insideRolledBackTransaction(async (trx, { auth }) => {
      const { user } = await seed(trx);
      return { user, found: await withinTimeout(auth.getUser(user.id, { trx }), 'auth.getUser') };
    });
    expect(got.found).toMatchObject({ id: got.user.id, fullName: 'Contract User', email: got.user.email, phoneE164: '+919812345678', isActive: true });
  });

  it('auth.getUser returns null for an unknown user', async () => {
    const found = await insideRolledBackTransaction((trx, { auth }) => withinTimeout(auth.getUser('00000000-0000-4000-8000-000000000000', { trx }), 'auth.getUser'));
    expect(found).toBeNull();
  });

  it('clubs.listRoleHolders(clubId, role, { trx }) reads through the caller transaction; revoked roles excluded', async () => {
    const got = await insideRolledBackTransaction(async (trx, { clubs }) => {
      const { user, club } = await seed(trx);
      const [other] = await trx('users').insert({ email: `contract-other-${club.slug}@example.test`, full_name: 'Revoked Head', password_hash: 'x' }).returning('*');
      await trx('club_role_assignments').insert({ club_id: club.id, user_id: other.id, role: 'CLUB_HEAD', revoked_at: new Date() });
      return {
        user,
        heads: await withinTimeout(clubs.listRoleHolders(club.id, 'CLUB_HEAD', { trx }), 'clubs.listRoleHolders'),
        treasurers: await withinTimeout(clubs.listRoleHolders(club.id, 'TREASURER', { trx }), 'clubs.listRoleHolders'),
      };
    });
    expect(got.heads).toEqual([{ userId: got.user.id }]);
    expect(got.treasurers).toEqual([]);
  });

  it('both lookups work together inside one transaction on a single-connection pool', async () => {
    const got = await insideRolledBackTransaction(async (trx, { auth, clubs }) => {
      const { club } = await seed(trx);
      const heads = await withinTimeout(clubs.listRoleHolders(club.id, 'CLUB_HEAD', { trx }), 'clubs.listRoleHolders');
      return Promise.all(heads.map((h) => withinTimeout(auth.getUser(h.userId, { trx }), 'auth.getUser')));
    });
    expect(got).toHaveLength(1);
    expect(got[0].fullName).toBe('Contract User');
  });
}
