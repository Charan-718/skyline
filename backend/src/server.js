import { loadConfig } from './config/index.js';
import { createDb } from './db/knex.js';
import { createLogger } from './shared/logger.js';
import { createClock } from './shared/clock.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';
import { createScheduler } from './jobs/scheduler.js';

// Boot: config → db → container → app.listen → scheduler.start (LLD §1.1).

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const db = createDb({ databaseUrl: config.databaseUrl, poolMax: config.databasePoolMax });
const clock = createClock({ timeZone: config.timezone });
const container = createContainer({ config, db, logger, clock });
const app = createApp(container);

const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'backend listening'));
const scheduler = createScheduler({ registry: container.jobs, timeZone: config.timezone, logger });
if (config.jobsEnabled) scheduler.start();

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    try {
      await scheduler.stop();
      await container.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
