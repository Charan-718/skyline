import cron from 'node-cron';
import { config } from '../config/index.js';
import { todayIST } from '../shared/clock.js';
import { runJob } from './runJob.js';
import { logger } from '../shared/logger.js';

export function startScheduler(jobs, { notifications } = {}) {
  if (!config.JOBS_ENABLED) {
    logger.info('Jobs disabled');
    return { stop: () => {} };
  }

  const tasks = [];

  tasks.push(
    cron.schedule('0 0 * * *', () => {
      runJob('membership-expiry', todayIST(), () => jobs.membershipExpiry.execute()).catch((err) =>
        logger.error({ err }, 'membership-expiry failed'),
      );
    }),
  );

  tasks.push(
    cron.schedule('0 9 * * *', () => {
      runJob('renewal-reminders', todayIST(), (trx) => jobs.renewalReminders.execute(trx)).catch((err) =>
        logger.error({ err }, 'renewal-reminders failed'),
      );
    }),
  );

  tasks.push(
    cron.schedule('0 6 * * *', () => {
      runJob('autopay-renewals', todayIST(), () => jobs.autopayRenewals.execute()).catch((err) =>
        logger.error({ err }, 'autopay-renewals failed'),
      );
    }),
  );

  tasks.push(
    cron.schedule('*/5 * * * *', () => {
      runJob(`reservation-expiry-${Date.now()}`, 'tick', () => jobs.reservationExpiry.execute()).catch((err) =>
        logger.error({ err }, 'reservation-expiry failed'),
      );
    }),
  );

  if (notifications) {
    // notification-dispatch (LLD §7): sends whatever the outbox holds that is due, every minute.
    tasks.push(
      cron.schedule('* * * * *', () => {
        notifications.dispatchPending().catch((err) => logger.error({ err }, 'notification-dispatch failed'));
      }),
    );
  }

  logger.info('Scheduler started');
  return {
    stop: () => tasks.forEach((t) => t.stop()),
  };
}
