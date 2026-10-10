import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/shared/logger.js';

function capture() {
  const lines = [];
  const stream = new Writable({
    write(chunk, enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => lines.join('') };
}

const SECRETS = {
  password: 'hunter2-PASSWORD',
  passwordHash: '$2b$12$HASHVALUE',
  cookie: 'sid=s%3ASESSIONVALUE.sig',
  authorization: 'Bearer AUTHVALUE',
  studentIdentifier: 'SRKR2023CS001',
  qrPayload: 'SOMS1:T:QRPAYLOADVALUE1234',
  qrToken: 'QRTOKENVALUE5678',
  phoneE164: '+919876543210',
  destination: 'asha@example.test',
  sid: 'RAWSESSIONID',
  sessionId: 'SESSIONIDVALUE',
};

describe('logger redaction (LLD §9)', () => {
  it('redacts sensitive keys at the top level and nested up to 3 levels', () => {
    const { stream, text } = capture();
    const logger = createLogger({ level: 'info', destination: stream });
    logger.info(SECRETS, 'top');
    logger.info({ body: SECRETS }, 'nested1');
    logger.info({ req: { headers: { cookie: SECRETS.cookie, authorization: SECRETS.authorization } } }, 'headers');
    logger.info({ a: { b: { c: SECRETS } } }, 'nested3');
    logger.info({ res: { headers: { 'set-cookie': ['sid=SETCOOKIEVALUE'] } } }, 'set-cookie');
    const out = text();
    for (const value of [...Object.values(SECRETS), 'SETCOOKIEVALUE']) {
      expect(out).not.toContain(value);
    }
    expect(out).toContain('[REDACTED]');
  });

  it('keeps non-sensitive fields', () => {
    const { stream, text } = capture();
    createLogger({ destination: stream }).info({ requestId: 'r-1', userId: 'u-1', status: 200 }, 'ok');
    expect(text()).toContain('"requestId":"r-1"');
  });
});
