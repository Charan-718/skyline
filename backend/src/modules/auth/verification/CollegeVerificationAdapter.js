/** @typedef {{ outcome: 'VERIFIED'|'NOT_VERIFIED'|'UNAVAILABLE', externalReference?: string, studentIdentifier?: string }} VerificationResult */

/**
 * @typedef {object} CollegeVerificationAdapter
 * @property {(input: { studentIdentifier?: string, fullName: string, accountEmail?: string }) => Promise<VerificationResult>} verify
 */

export {};
