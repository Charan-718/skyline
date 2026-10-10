import crypto from 'node:crypto';
import { randomInt } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CROCKFORD_ALPHABET = CROCKFORD;

export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function crockfordCode(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD[randomInt(CROCKFORD.length)];
  return out;
}

/** Group 1 payment references (same shape as paymentReference). */
export function randomReference(prefix = 'SIM') {
  return `${prefix}-${crockfordCode(12)}`;
}

export function paymentReference() {
  return randomReference('SIM');
}

export const ticketCode = () => crockfordCode(10);
export const pickupCode = () => crockfordCode(8);
