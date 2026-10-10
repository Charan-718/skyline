import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures/students.mock.json'), 'utf8'));

function normalizeEmail(email) {
  return email?.trim().toLowerCase() ?? '';
}

function nameMatches(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

/** Emails reserved for club-head signup (must match college DB exactly). */
export function isClubHeadRegistrationEmail(email) {
  const normalized = normalizeEmail(email);
  return fixtures.some((s) => s.clubHeadEligible && normalizeEmail(s.collegeEmail) === normalized);
}

/** Club head display name used with a different email (impersonation). */
export function isClubHeadIdentityMismatch(fullName, email) {
  return fixtures.some(
    (s) =>
      s.clubHeadEligible &&
      nameMatches(s.fullName, fullName) &&
      normalizeEmail(s.collegeEmail) !== normalizeEmail(email),
  );
}

export function getCollegeRosterFixtures() {
  return fixtures;
}
