import { createAdapters } from './adapters/index.js';
import { createNotificationService as createG2NotificationService } from './service.g2.js';
import { createNotificationService } from './service.g1.js';
import { createNotificationDevRoutes } from './routes.js';
import { createNotificationController } from './controller.js';

export { createNotificationRepository } from './repository.js';
export { createNotificationService };

export function createNotificationsModule({ db, clock, auth, config, logger, adapters }) {
  const notifications = createG2NotificationService({
    db,
    clock,
    auth,
    logger,
    adapters: adapters ?? createAdapters({ mode: config.notifyMode, failChannel: config.devNotifyFailChannel, smtp: config.smtp }),
  });
  return Object.freeze({
    enqueue: notifications.enqueue,
    dispatchPending: notifications.dispatchPending,
    outbox: notifications.outbox,
    devRoutes: (deps) =>
      createNotificationDevRoutes({ controller: createNotificationController({ notifications }), ...deps }),
  });
}
