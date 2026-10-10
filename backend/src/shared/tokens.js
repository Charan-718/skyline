import crypto from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomReference(prefix = 'SIM') {
  const chars = CROCKFORD;
  let code = '';
  const buf = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    code += chars[buf[i] % chars.length];
  }
  return `${prefix}-${code}`;
}

export function ticketCode(length = 10) {
  let code = '';
  const buf = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += CROCKFORD[buf[i] % CROCKFORD.length];
  }
  return code;
}

export function pickupCode(length = 8) {
  return ticketCode(length);
}
