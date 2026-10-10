import { describe, expect, it } from 'vitest';
import { buildPayload, parsePayload, QR_KIND, renderSvg } from '../../src/shared/qr.js';
import { randomToken } from '../../src/shared/tokens.js';

describe('qr helpers', () => {
  const token = randomToken();

  it('builds and parses SOMS1 payloads for both kinds', () => {
    const m = buildPayload(QR_KIND.MEMBERSHIP, token);
    expect(m).toBe(`SOMS1:M:${token}`);
    expect(parsePayload(m)).toEqual({ kind: 'M', token });
    expect(parsePayload(buildPayload(QR_KIND.TICKET, token))).toEqual({ kind: 'T', token });
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'SOMS2:T:abcdefghijklmnopqrst', `SOMS1:X:${token}`, 'SOMS1:T:short', null, 42]) {
      expect(parsePayload(bad)).toBeNull();
    }
    expect(() => buildPayload('Z', token)).toThrow();
  });

  it('renders SVG server-side', async () => {
    const svg = await renderSvg(buildPayload(QR_KIND.TICKET, token));
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
});
