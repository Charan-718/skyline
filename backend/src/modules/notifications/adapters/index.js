import { randomUUID } from 'node:crypto';

// Delivery adapters (LLD §2.7). No real provider is assumed or called.
//   EmailAdapter.send({ to, subject, text })   WhatsAppAdapter.send({ toE164, text })
//   -> { provider, providerMessageId }  or throws NotificationError { code, retryable }
// Dev adapters accept everything (the message is visible in GET /dev/outbox) unless
// DEV_NOTIFY_FAIL_CHANNEL names their channel, which makes them fail with a retryable error.
// Unconfigured adapters always fail with non-retryable NOT_CONFIGURED.

export class NotificationError extends Error {
  constructor(code, { retryable }) {
    super(code);
    this.name = 'NotificationError';
    this.code = code;
    this.retryable = retryable;
  }
}

function devAdapter(channel, { failChannel }) {
  return Object.freeze({
    channel,
    async send() {
      if (failChannel === channel) throw new NotificationError('DEV_FORCED_FAILURE', { retryable: true });
      return { provider: 'dev', providerMessageId: `dev-${randomUUID()}` };
    },
  });
}

function unconfiguredAdapter(channel) {
  return Object.freeze({
    channel,
    async send() {
      throw new NotificationError('NOT_CONFIGURED', { retryable: false });
    },
  });
}

/** NOTIFY_MODE dev | unconfigured -> { EMAIL, WHATSAPP } adapters. */
export function createAdapters({ mode, failChannel }) {
  if (mode === 'dev') return { EMAIL: devAdapter('EMAIL', { failChannel }), WHATSAPP: devAdapter('WHATSAPP', { failChannel }) };
  if (mode === 'unconfigured') return { EMAIL: unconfiguredAdapter('EMAIL'), WHATSAPP: unconfiguredAdapter('WHATSAPP') };
  throw new TypeError(`unknown NOTIFY_MODE ${mode}`);
}
