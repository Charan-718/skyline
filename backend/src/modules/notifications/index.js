import { createAdapters } from './adapters/index.js';
import { createNotificationService } from './service.js';
import { createNotificationDevRoutes } from './routes.js';
import { createNotificationController } from './controller.js';

// Public API of the notifications module (M6 delivery side): enqueue(trx, items), dispatchPending().
export function createNotificationsModule({ db, clock, auth, config, logger, adapters }) {
  const notifications = createNotificationService({
    db,
    clock,
    auth,
    logger,
    adapters: adapters ?? createAdapters({ mode: config.notifyMode, failChannel: config.devNotifyFailChannel }),
  });
  return Object.freeze({
    enqueue: notifications.enqueue,
    dispatchPending: notifications.dispatchPending,
    devRoutes: (deps) => createNotificationDevRoutes({ controller: createNotificationController({ notifications }), ...deps }),
  });
}
