import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import { createAdapters } from '../../src/modules/notifications/adapters/index.js';

// Email over SMTP. The message is composed by the real nodemailer (stream transport: nothing is
// sent); failures are simulated with a fake transport.

const smtp = { host: 'smtp.gmail.com', port: 465, secure: true, user: 'proto@gmail.com', pass: 'app-password', fromEmail: 'proto@gmail.com', fromName: 'SOMS' };
const failing = (err) => ({ sendMail: async () => { throw Object.assign(new Error('boom member@example.test app-password'), err); } });
const email = (transport) => createAdapters({ mode: 'smtp', smtp, transport }).EMAIL;
const run = (adapter) => adapter.send({ to: 'member@example.test', subject: 'S', text: 'T' }).catch((e) => e);

describe('smtp email adapter', () => {
  it('composes a plain-text mail with the configured sender and returns the message id', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const out = await email(transport).send({ to: 'a@b.test', subject: 'Subj', text: 'Body line' });
    expect(out.provider).toBe('smtp');
    expect(out.providerMessageId).toMatch(/^<.+@.+>$/);
    const raw = (await transport.sendMail({ from: { name: 'SOMS', address: 'proto@gmail.com' }, to: 'a@b.test', subject: 'Subj', text: 'Body line' })).message.toString();
    expect(raw).toMatch(/From: SOMS <proto@gmail.com>/);
    expect(raw).toMatch(/To: a@b.test/);
    expect(raw).toMatch(/Subject: Subj/);
    expect(raw).toContain('Body line');
  });

  it('connection problems and 4xx replies are retryable; bad login and 5xx are permanent', async () => {
    expect(await run(email(failing({ code: 'ETIMEDOUT' })))).toMatchObject({ code: 'SMTP_ETIMEDOUT', retryable: true });
    expect(await run(email(failing({ code: 'ECONNECTION' })))).toMatchObject({ retryable: true });
    expect(await run(email(failing({ responseCode: 421 })))).toMatchObject({ code: 'SMTP_421', retryable: true });
    expect(await run(email(failing({ code: 'EAUTH', responseCode: 535 })))).toMatchObject({ code: 'SMTP_AUTH', retryable: false });
    expect(await run(email(failing({ responseCode: 550 })))).toMatchObject({ code: 'SMTP_550', retryable: false });
    expect(await run(email(failing({})))).toMatchObject({ code: 'SMTP_ERROR', retryable: false });
  });

  it('no address or password ever appears in the error', async () => {
    for (const e of [{ code: 'EAUTH' }, { responseCode: 550 }, { code: 'ETIMEDOUT' }, {}]) {
      const err = await run(email(failing(e)));
      expect(`${err.message}${err.code}`).not.toMatch(/member@|app-password/);
    }
  });

  it('missing host/sender falls back to NOT_CONFIGURED instead of throwing at startup', async () => {
    const a = createAdapters({ mode: 'smtp', smtp: { user: 'x@gmail.com' } });
    await expect(a.EMAIL.send({ to: 'a@b.test', subject: 's', text: 't' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
  });

  it('email is the only channel in every mode', async () => {
    for (const mode of ['dev', 'unconfigured', 'smtp']) expect(Object.keys(createAdapters({ mode, smtp }))).toEqual(['EMAIL']);
  });
});
