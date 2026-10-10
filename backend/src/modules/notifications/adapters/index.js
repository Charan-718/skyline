import { randomUUID } from 'node:crypto';
import { NotificationError } from './NotificationError.js';
import { createSmtpEmailAdapter } from './smtp.js';

// Delivery adapters (LLD §2.7). Email is the only channel.
//   EmailAdapter.send({ to, subject, text }) -> { provider, providerMessageId }  or throws NotificationError { code, retryable }
// dev: accepts everything (visible in GET /dev/outbox) unless DEV_NOTIFY_FAIL_CHANNEL=EMAIL, which makes it fail with a retryable error.
// unconfigured: always fails with non-retryable NOT_CONFIGURED.
// smtp: real sends through any SMTP mailbox (nodemailer), e.g. Gmail with an App Password.

export { NotificationError };

function devAdapter({ failChannel }) {
  return Object.freeze({
    channel: 'EMAIL',
    async send() {
      if (failChannel === 'EMAIL') throw new NotificationError('DEV_FORCED_FAILURE', { retryable: true });
      return { provider: 'dev', providerMessageId: `dev-${randomUUID()}` };
    },
  });
}

function unconfiguredAdapter() {
  return Object.freeze({
    channel: 'EMAIL',
    async send() {
      throw new NotificationError('NOT_CONFIGURED', { retryable: false });
    },
  });
}

/**
 * NOTIFY_MODE dev | unconfigured | smtp -> { EMAIL } adapter.
 * Missing SMTP settings fall back to the unconfigured adapter (rows fail with NOT_CONFIGURED
 * instead of the server refusing to start).
 */
export function createAdapters({ mode, failChannel, smtp = {}, transport }) {
  if (mode === 'dev') return { EMAIL: devAdapter({ failChannel }) };
  if (mode === 'unconfigured') return { EMAIL: unconfiguredAdapter() };
  if (mode === 'smtp') {
    return { EMAIL: smtp.host && smtp.fromEmail ? createSmtpEmailAdapter({ ...smtp, transport }) : unconfiguredAdapter() };
  }
  throw new TypeError(`unknown NOTIFY_MODE ${mode}`);
}
