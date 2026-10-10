/** @param {string} email */
export function emailDomain(email) {
  return email.split('@')[1]?.trim().toLowerCase() ?? '';
}

/** @param {string} email @param {string[]} collegeDomains */
export function isCollegeEmailDomain(email, collegeDomains) {
  const domain = emailDomain(email);
  return domain.length > 0 && collegeDomains.includes(domain);
}

/**
 * @param {string} email
 * @param {'VERIFIED'|'NOT_VERIFIED'|'UNAVAILABLE'|null|undefined} verificationOutcome
 * @param {string[]} collegeDomains
 * @returns {'OUTSIDER'|'COLLEGE_STUDENT'|'UNVERIFIED_COLLEGE_EMAIL'}
 */
export function resolveAccountAudience(email, verificationOutcome, collegeDomains) {
  if (!isCollegeEmailDomain(email, collegeDomains)) {
    return 'OUTSIDER';
  }
  if (verificationOutcome === 'VERIFIED') {
    return 'COLLEGE_STUDENT';
  }
  return 'UNVERIFIED_COLLEGE_EMAIL';
}
