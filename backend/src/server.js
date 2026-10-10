import { createContainer } from './container.js';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './shared/logger.js';
import { startScheduler } from './jobs/scheduler.js';

const container = createContainer();
const app = createApp(container);
const scheduler = startScheduler(container.jobs);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'SOMS backend listening');
});

function shutdown() {
  scheduler.stop();
  server.close(() => {
    container.db.destroy().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
