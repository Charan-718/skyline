import cron from 'node-cron';

// node-cron registrations (LLD §7), times in APP_TIMEZONE. Started by server.js only when
// JOBS_ENABLED=true; tests invoke jobs directly.

export function createScheduler({ registry, timeZone, logger }) {
  const tasks = [];
  return Object.freeze({
    start() {
      for (const name of registry.names()) {
        const { cron: expression } = registry.get(name);
        tasks.push(
          cron.schedule(expression, () => {
            registry.run(name).catch((err) => logger.error({ err, job: name }, 'scheduler: job crashed'));
          }, { timezone: timeZone, name }),
        );
      }
      logger.info({ jobs: registry.names() }, 'scheduler started');
    },
    async stop() {
      await Promise.all(tasks.map((t) => t.stop()));
      tasks.length = 0;
    },
  });
}
