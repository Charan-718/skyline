import { describe, expect, it } from 'vitest';
import { CROCKFORD_ALPHABET, paymentReference, pickupCode, randomToken, ticketCode } from '../../src/shared/tokens.js';

describe('tokens', () => {
  it('randomToken is 128-bit base64url by default', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(t, 'base64url')).toHaveLength(16);
    expect(randomToken()).not.toBe(t);
  });

  it('codes use Crockford base32 (no I, L, O, U)', () => {
    expect(CROCKFORD_ALPHABET).not.toMatch(/[ILOU]/);
    expect(ticketCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(pickupCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('payment references are SIM-<12 chars>', () => {
    expect(paymentReference()).toMatch(/^SIM-[0-9A-HJKMNP-TV-Z]{12}$/);
  });
});
