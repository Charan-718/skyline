import { formatDateTime } from './dates';

// Error code → friendly text (LLD §6.3). Falls back to the server message.
const MESSAGES = {
  NETWORK_ERROR: 'Cannot reach the server. Check your connection and try again.',
  UNAUTHENTICATED: 'Your session has ended. Please sign in again.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find what you were looking for.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  TICKET_ALREADY_USED: (d) => `Already used${d.usedAt ? ` at ${formatDateTime(d.usedAt)}` : ''}${d.checkedInByName ? ` · scanned by ${d.checkedInByName}` : ''}.`,
};

export function errorMessage(error) {
  if (!error) return '';
  const m = MESSAGES[error.code];
  if (typeof m === 'function') return m(error.details || {});
  return error.message || m || MESSAGES.INTERNAL_ERROR;
}

/** Field-level errors from a VALIDATION_FAILED response. */
export const fieldErrors = (error) => error?.details?.fields || {};
