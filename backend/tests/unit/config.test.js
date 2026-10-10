import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/soms' };

describe('config (LLD §1.3)', () => {
  it('applies documented defaults, each OD default behind one variable', () => {
    const c = loadConfig(base);
    expect(c.pricingCombinationMode).toBe('BEST_OF'); // OD-01
    expect(c.reservationHoldMinutes).toBe(15); // ASM-13
    expect(c.fundraiserAtRiskTolerancePct).toBe(20);
    expect(c.autopayPendingTimeoutHours).toBe(24);
    expect(c.group1Schema).toBe('migrations');
  });

  it('fails fast listing invalid values', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, PRICING_COMBINATION_MODE: 'SUM' })).toThrow(/PRICING_COMBINATION_MODE/);
    expect(() => loadConfig({ ...base, MAX_UPLOAD_BYTES: '6000000' })).toThrow(/MAX_UPLOAD_BYTES/);
  });

  it('production requires a real session secret, never uses the fixture, never enables dev tools', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    const secret = 'x'.repeat(40);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', SESSION_SECRET: secret, GROUP1_SCHEMA: 'fixture' })).toThrow(
      /GROUP1_SCHEMA/,
    );
    const prod = loadConfig({ ...base, NODE_ENV: 'production', SESSION_SECRET: secret, DEV_TOOLS_ENABLED: 'true' });
    expect(prod.devToolsEnabled).toBe(false);
  });
});
