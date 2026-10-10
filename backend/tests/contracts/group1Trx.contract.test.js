import { afterAll, beforeAll, describe } from 'vitest';
import { createTestDb } from '../helpers/testDb.js';
import { createGroup1Fakes } from '../helpers/group1Fakes.js';
import { group1TrxContract } from './group1Trx.contract.js';

// OQ-59 contract (see group1Trx.contract.js).
//   Default: checks the Group 2 test stand-ins, so Group 2 code is exercised against the contract.
//   Group 1: run `npm run test:contract:group1` (GROUP1_CONTRACT_IMPL=src) to check the real
//   src/modules/auth and src/modules/clubs. Their getUser/listRoleHolders must use { trx }.

const useSrc = process.env.GROUP1_CONTRACT_IMPL === 'src';

async function srcImpl() {
  const auth = await import('../../src/modules/auth/index.js');
  const clubs = await import('../../src/modules/clubs/index.js');
  return () => ({ auth, clubs });
}

describe(`OQ-59 Group 1 { trx } contract — ${useSrc ? 'src/modules (Group 1 implementation)' : 'test stand-ins'}`, () => {
  let db;
  let impl;
  beforeAll(async () => {
    db = createTestDb({ poolMax: 1 });
    impl = useSrc ? await srcImpl() : (conn) => createGroup1Fakes(conn);
  });
  afterAll(() => db.destroy());

  group1TrxContract({ getDb: () => db, impl: (conn) => impl(conn) });
});
