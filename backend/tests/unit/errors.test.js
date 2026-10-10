import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError, appError, ERROR_CODES } from '../../src/shared/errors.js';
import { lldPath } from '../helpers/lld.js';

describe('AppError (LLD §9)', () => {
  it('every registered code is documented in LLD.md', () => {
    const lld = readFileSync(lldPath(), 'utf8');
    for (const code of Object.keys(ERROR_CODES)) {
      expect(lld, `${code} missing from ${path.basename(lldPath())}`).toContain(`\`${code}\``);
    }
  });

  it('refuses undocumented codes and mismatched HTTP statuses', () => {
    expect(() => new AppError('MADE_UP_CODE')).toThrow(/Undocumented/);
    expect(() => new AppError('NOT_FOUND', 403)).toThrow(/must use HTTP 404/);
  });

  it('appError fills status and default message', () => {
    const err = appError('CONFLICT_STATE', { currentStatus: 'SUCCEEDED' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.httpStatus).toBe(409);
    expect(err.details).toEqual({ currentStatus: 'SUCCEEDED' });
    expect(err.message).toBeTruthy();
  });
});
