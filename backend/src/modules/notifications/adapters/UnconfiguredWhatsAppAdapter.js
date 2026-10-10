import { NotificationError } from './UnconfiguredEmailAdapter.js';

export function createUnconfiguredWhatsAppAdapter() {
  return {
    async send() {
      throw new NotificationError('WhatsApp not configured', { retryable: false, code: 'NOT_CONFIGURED' });
    },
  };
}
