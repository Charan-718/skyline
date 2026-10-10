import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COLLEGE_DOMAIN,
  STUDENT_FIRST,
  STUDENT_LAST,
  studentEmail,
  studentRoll,
} from './demoSeedConstants.js';

const EXTRA_ROSTER_STUDENTS = 150;
const DEPT_CODES = ['CS', 'ME', 'EE', 'IT', 'CE', 'EC', 'AD', 'CH'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../../../modules/auth/verification/fixtures/students.mock.json');

function loadFixtures() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

export async function runCollegeRosterSeed(knex) {
  const fixtures = loadFixtures();
  for (const s of fixtures) {
    await upsertRoster(knex, {
      studentIdentifier: s.studentIdentifier,
      fullName: s.fullName,
      collegeEmail: s.collegeEmail ?? null,
      program: s.program ?? null,
      clubHeadEligible: s.clubHeadEligible === true,
    });
  }

  const existingExtra = await knex('college_student_roster')
    .where('student_identifier', 'like', 'SKY2025%')
    .count('* as c')
    .first();
  const extraCount = Number(existingExtra.c);
  if (extraCount < EXTRA_ROSTER_STUDENTS) {
    for (let i = extraCount; i < EXTRA_ROSTER_STUDENTS; i += 1) {
      const first = STUDENT_FIRST[(i + 5) % STUDENT_FIRST.length];
      const last = STUDENT_LAST[(i * 13) % STUDENT_LAST.length];
      await upsertRoster(knex, {
        studentIdentifier: studentRoll(2025, DEPT_CODES[i % DEPT_CODES.length], i + 1),
        fullName: `${first} ${last}`,
        collegeEmail: studentEmail(first, last, String(i + 1)),
        program: `B.Tech ${DEPT_CODES[i % DEPT_CODES.length]} 2025`,
        clubHeadEligible: false,
      });
    }
  }

  await syncSkylineAppUsers(knex);

  const [{ c }] = await knex('college_student_roster').where({ is_active: true }).count('* as c');
  // eslint-disable-next-line no-console
  console.log(`[seed] College roster: ${c} active students (@${COLLEGE_DOMAIN} + roll IDs for verification)`);
}

async function upsertRoster(knex, row) {
  await knex('college_student_roster')
    .insert({
      student_identifier: row.studentIdentifier,
      full_name: row.fullName,
      college_email: row.collegeEmail ? row.collegeEmail.toLowerCase() : null,
      program: row.program ?? null,
      club_head_eligible: row.clubHeadEligible === true,
      linked_user_id: row.linkedUserId ?? null,
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })
    .onConflict('student_identifier')
    .merge({
      full_name: row.fullName,
      college_email: row.collegeEmail ? row.collegeEmail.toLowerCase() : null,
      program: row.program ?? null,
      club_head_eligible: row.clubHeadEligible === true,
      linked_user_id: knex.raw('COALESCE(college_student_roster.linked_user_id, excluded.linked_user_id)'),
      is_active: true,
      updated_at: knex.fn.now(),
    });
}

async function syncSkylineAppUsers(knex) {
  const users = await knex('users')
    .whereRaw('lower(email) like ?', [`%@${COLLEGE_DOMAIN}`])
    .select('id', 'email', 'full_name');
  let seq = 1;
  for (const u of users) {
    const byEmail = await knex('college_student_roster')
      .whereRaw('lower(college_email) = ?', [u.email.toLowerCase()])
      .first();
    if (byEmail) {
      if (!byEmail.linked_user_id) {
        await knex('college_student_roster')
          .where({ id: byEmail.id })
          .update({ linked_user_id: u.id, updated_at: knex.fn.now() });
      }
      continue;
    }
    let studentIdentifier = `SKY2024A${String(seq).padStart(3, '0')}`;
    while (await knex('college_student_roster').where({ student_identifier: studentIdentifier }).first()) {
      seq += 1;
      studentIdentifier = `SKY2024A${String(seq).padStart(3, '0')}`;
    }
    seq += 1;
    await upsertRoster(knex, {
      studentIdentifier,
      fullName: u.full_name,
      collegeEmail: u.email,
      program: 'Skyline app account',
      clubHeadEligible: false,
      linkedUserId: u.id,
    });
  }
}
