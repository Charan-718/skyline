export class NotificationError extends Error {
  constructor(message, { retryable = false, code = 'NOT_CONFIGURED' } = {}) {
    super(message);
    this.name = 'NotificationError';
    this.retryable = retryable;
    this.code = code;
  }
}

export function createUnconfiguredEmailAdapter() {
  return {
    async send() {
      throw new NotificationError('Email not configured', { retryable: false, code: 'NOT_CONFIGURED' });
    },
  };
}
