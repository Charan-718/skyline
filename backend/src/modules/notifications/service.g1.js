// G2-STUB: dispatch is minimal; full dispatcher owned by Group 2.
import { config } from '../../config/index.js';
import { createDevEmailAdapter } from './adapters/DevEmailAdapter.js';
import { createUnconfiguredEmailAdapter } from './adapters/UnconfiguredEmailAdapter.js';

function pickAdapters() {
  return { EMAIL: config.NOTIFY_MODE === 'dev' ? createDevEmailAdapter() : createUnconfiguredEmailAdapter() };
}

export function createNotificationService({ notificationRepository }) {
  const adapters = pickAdapters();

  return {
    /**
     * @param {import('knex').Knex.Transaction} trx
     */
    async enqueue(trx, delivery) {
      const row = {
        club_id: delivery.clubId ?? null,
        recipient_user_id: delivery.recipientUserId,
        channel: delivery.channel,
        template: delivery.template,
        announcement_id: delivery.announcementId ?? null,
        destination: delivery.destination ?? null,
        payload: delivery.payload,
        status: delivery.status ?? 'PENDING',
        dedupe_key: delivery.dedupeKey,
        last_error: delivery.lastError ?? null,
      };
      if (delivery.status === 'SKIPPED') {
        row.next_attempt_at = trx.fn.now();
      }
      await notificationRepository.enqueueMany([row], trx);
    },

    /** No-op minimal dispatch for Group 1 — marks dev sends as SENT when invoked. */
    async dispatchBatch(_limit = 50) {
      return { processed: 0 };
    },
  };
}
