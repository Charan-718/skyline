// Delivery retry policy (LLD §2.7; OQ-17 default). Pure.
//   3 attempts in total; after attempt 1 wait 1 min, after attempt 2 wait 5 min; then FAILED.
//   Non-retryable errors (NOT_CONFIGURED) fail immediately. SENDING > 10 min = crashed claim.

export const MAX_ATTEMPTS = 3;
export const STUCK_AFTER_MS = 10 * 60_000;
const DELAYS_MS = Object.freeze({ 1: 60_000, 2: 5 * 60_000 });

/** attempts = attempts made including the one that just failed. */
export function afterFailure({ attempts, retryable, now }) {
  if (!retryable || attempts >= MAX_ATTEMPTS) return { status: 'FAILED', nextAttemptAt: null };
  return { status: 'PENDING', nextAttemptAt: new Date(now.getTime() + DELAYS_MS[attempts]) };
}
