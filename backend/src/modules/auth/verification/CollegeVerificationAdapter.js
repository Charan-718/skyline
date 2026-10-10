/** @typedef {{ outcome: 'VERIFIED'|'NOT_VERIFIED'|'UNAVAILABLE', externalReference?: string }} VerificationResult */

/**
 * @typedef {object} CollegeVerificationAdapter
 * @property {(input: { studentIdentifier: string, fullName: string }) => Promise<VerificationResult>} verify
 */

export {};
