import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures/students.mock.json'), 'utf8'));

export function createMockCollegeVerificationAdapter() {
  return {
    async verify({ studentIdentifier, fullName }) {
      if (studentIdentifier === 'MOCK-UNAVAILABLE') {
        return { outcome: 'UNAVAILABLE' };
      }
      const match = fixtures.find(
        (s) =>
          s.studentIdentifier === studentIdentifier &&
          s.fullName.localeCompare(fullName, undefined, { sensitivity: 'accent' }) === 0,
      );
      if (match) {
        return { outcome: 'VERIFIED', externalReference: `mock:${studentIdentifier}` };
      }
      return { outcome: 'NOT_VERIFIED' };
    },
  };
}
