export class NotificationError extends Error {
  constructor(code, { retryable }) {
    super(code);
    this.name = 'NotificationError';
    this.code = code;
    this.retryable = retryable;
  }
}
