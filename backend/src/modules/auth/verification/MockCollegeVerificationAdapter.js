import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures/students.mock.json'), 'utf8'));

function normalizeEmail(email) {
  return email?.trim().toLowerCase() ?? '';
}

export function createMockCollegeVerificationAdapter() {
  return {
    /**
     * @param {{ studentIdentifier: string, fullName: string, accountEmail?: string }} input
     */
    async verify({ studentIdentifier, fullName, accountEmail }) {
      if (studentIdentifier === 'MOCK-UNAVAILABLE') {
        return { outcome: 'UNAVAILABLE' };
      }

      const nameMatches = (a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

      if (studentIdentifier) {
        const match = fixtures.find(
          (s) => s.studentIdentifier === studentIdentifier && nameMatches(s.fullName, fullName),
        );
        if (!match) {
          return { outcome: 'NOT_VERIFIED' };
        }
        if (match.collegeEmail && accountEmail) {
          if (normalizeEmail(accountEmail) !== normalizeEmail(match.collegeEmail)) {
            return { outcome: 'NOT_VERIFIED' };
          }
        }
        return {
          outcome: 'VERIFIED',
          externalReference: `mock:${studentIdentifier}`,
          studentIdentifier: match.studentIdentifier,
        };
      }

      if (accountEmail) {
        const match = fixtures.find(
          (s) =>
            s.collegeEmail &&
            normalizeEmail(s.collegeEmail) === normalizeEmail(accountEmail) &&
            nameMatches(s.fullName, fullName),
        );
        if (!match) {
          return { outcome: 'NOT_VERIFIED' };
        }
        return {
          outcome: 'VERIFIED',
          externalReference: `mock:${match.studentIdentifier}`,
          studentIdentifier: match.studentIdentifier,
        };
      }

      return { outcome: 'NOT_VERIFIED' };
    },
  };
}

/** Dev helper: list roster (no secrets). */
export function listMockCollegeStudents() {
  return fixtures.map(({ studentIdentifier, fullName, collegeEmail, program, clubHeadEligible }) => ({
    studentIdentifier,
    fullName,
    collegeEmail: collegeEmail ?? null,
    program: program ?? null,
    clubHeadEligible: clubHeadEligible === true,
  }));
}
