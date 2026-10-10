import { config } from '../../config/index.js';

/** @param {{ collegeRosterRepository: ReturnType<import('./repository.js').createCollegeRosterRepository> }} deps */
export function createDbCollegeVerificationAdapter({ collegeRosterRepository }) {
  return {
    async verify({ studentIdentifier, fullName, accountEmail }) {
      const result = await collegeRosterRepository.findVerificationMatch({
        studentIdentifier,
        fullName,
        accountEmail,
        collegeDomains: config.COLLEGE_EMAIL_DOMAINS,
      });
      if (result.outcome === 'VERIFIED') {
        return {
          outcome: 'VERIFIED',
          externalReference: result.externalReference,
          studentIdentifier: result.studentIdentifier,
        };
      }
      return { outcome: result.outcome };
    },
  };
}
