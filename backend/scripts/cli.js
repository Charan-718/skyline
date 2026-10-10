import 'dotenv/config';
import { db } from '../src/db/knex.js';
import { createClubRepository } from '../src/modules/clubs/repository.js';
import { createAuthRepository } from '../src/modules/auth/repository.js';
import { createClubService } from '../src/modules/clubs/service.js';
import { createClubAuthz } from '../src/modules/clubs/authz.js';
import { createAuditRepository } from '../src/shared/auditRepository.js';

const authz = createClubAuthz({ db });
const clubRepository = createClubRepository({ db });
const authRepository = createAuthRepository({ db });
const auditRepository = createAuditRepository(db);
const clubService = createClubService({ clubRepository, authRepository, auditRepository, authz });

const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === 'create-club') {
    const [slug, name, prefix] = args;
    if (!slug || !name || !prefix) {
      console.error('Usage: npm run cli -- create-club <slug> <name> <memberNumberPrefix>');
      process.exit(1);
    }
    const club = await clubService.createClubViaCli({ slug, name, memberNumberPrefix: prefix });
    console.log(JSON.stringify(club, null, 2));
    return;
  }
  if (command === 'assign-club-head') {
    const [clubId, email] = args;
    if (!clubId || !email) {
      console.error('Usage: npm run cli -- assign-club-head <clubId> <userEmail>');
      process.exit(1);
    }
    const assignment = await clubService.assignClubHeadViaCli(clubId, email);
    console.log(JSON.stringify(assignment, null, 2));
    return;
  }
  console.error('Unknown command. Supported: create-club, assign-club-head');
  process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.destroy());
