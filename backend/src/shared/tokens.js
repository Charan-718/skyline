import { randomBytes, randomInt } from 'node:crypto';

// Crockford base32 without I, L, O, U.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 128-bit (default) random token, base64url — QR tokens. */
export function randomToken(bytes = 16) {
  return randomBytes(bytes).toString('base64url');
}

export function crockfordCode(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD[randomInt(CROCKFORD.length)];
  return out;
}

export const ticketCode = () => crockfordCode(10);
export const pickupCode = () => crockfordCode(8);
export const paymentReference = () => `SIM-${crockfordCode(12)}`;
export const CROCKFORD_ALPHABET = CROCKFORD;
