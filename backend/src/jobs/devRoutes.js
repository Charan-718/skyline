import { Router } from 'express';
import { z } from 'zod';
import { runJob } from './runJob.js';
import { DEFAULT_DAYS_BEFORE } from './definitions/renewalReminders.js';

// POST /dev/jobs/renewal-reminders/run (dev tools only; signed-in user; X-Requested-With: soms).
// Demo trigger for the scheduled job: runs "membership about to expire" now, then dispatches the
// outbox so the reminder emails go out immediately instead of at 09:00 / next minute.
//   daysBefore  members whose expires_on is exactly this many days from today (default 7)
//   resend      send again even if a reminder for this expiry was already queued
//   dispatch    false = only queue (the minute-by-minute dispatcher sends later)
// Email addresses are masked in the response; message bodies are not returned.

const body = z
  .object({
    daysBefore: z.number().int().min(0).max(365).default(DEFAULT_DAYS_BEFORE),
    resend: z.boolean().default(false),
    dispatch: z.boolean().default(true),
  })
  .strict();

const mask = (v) => (v ? v.replace(/^(.).*(@.*)$/, '$1***$2') : null);

export function createJobDevRoutes({ db, requireAuth, csrfHeader, renewalReminders, notifications }) {
  const r = Router();
  r.post('/dev/jobs/renewal-reminders/run', requireAuth, csrfHeader, async (req, res) => {
    // Parsed here, not by validate(): the body is optional and a missing one means all defaults.
    const options = body.parse(req.body ?? {});
    const startedAt = new Date();
    // A manual run gets its own run key, so it never collides with the 09:00 daily run.
    const job = await runJob('renewal-reminders', `manual-${startedAt.getTime()}`, (trx) => renewalReminders.execute(trx, options));
    const dispatch = options.dispatch ? await notifications.dispatchPending() : null;
    const rows = await db('notification_deliveries')
      .where('created_at', '>=', startedAt)
      .where({ template: 'RENEWAL_REMINDER_7D' })
      .orderBy([{ column: 'channel' }, { column: 'created_at' }]);
    res.json({
      data: {
        job: job.summary ?? null,
        dispatch,
        deliveries: rows.map((d) => ({
          id: d.id,
          channel: d.channel,
          variant: d.payload?.autopayEnabled ? 'AUTOPAY' : 'RENEW',
          status: d.status,
          destination: mask(d.destination),
          provider: d.provider,
          attempts: d.attempts,
          lastError: d.last_error,
        })),
      },
    });
  });
  return r;
}
