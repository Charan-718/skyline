import { db } from '../db/knex.js';
import { logger } from '../shared/logger.js';

export async function runJob(jobName, runKey, fn) {
  const lockKey = `${jobName}:${runKey}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  return db.transaction(async (trx) => {
    const lock = await trx.raw('SELECT pg_try_advisory_xact_lock(?) AS ok', [lockKey]);
    if (!lock.rows[0]?.ok) {
      logger.info({ jobName, runKey }, 'Job skipped — lock not acquired');
      return { skipped: true };
    }

    try {
      await trx('job_runs').insert({
        job_name: jobName,
        run_key: runKey,
        status: 'RUNNING',
      });
    } catch (err) {
      if (err.code === '23505') {
        return { skipped: true };
      }
      throw err;
    }

    try {
      const summary = await fn(trx);
      await trx('job_runs')
        .where({ job_name: jobName, run_key: runKey })
        .update({ status: 'SUCCEEDED', finished_at: trx.fn.now(), summary: summary ?? {} });
      return { skipped: false, summary };
    } catch (err) {
      await trx('job_runs')
        .where({ job_name: jobName, run_key: runKey })
        .update({
          status: 'FAILED',
          finished_at: trx.fn.now(),
          error: err.message,
        });
      throw err;
    }
  });
}
