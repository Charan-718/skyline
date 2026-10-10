import { isoDateInZone } from '../shared/clock.js';

// Job table (LLD §7). Group 2 registers its own jobs; Group 1 adds membership-expiry,
// renewal-reminders and autopay-renewals (daily) here when their definitions exist.
//   daily: true  -> run key = IST date of `now`; false -> lock only (no job_runs row).

export function createJobRegistry({ definitions, runJob, clock, timeZone }) {
  const jobs = new Map(Object.entries(definitions));

  async function run(name, { asOf, options = {} } = {}) {
    const job = jobs.get(name);
    if (!job) return null;
    const now = asOf ?? clock.now();
    const runKey = job.daily ? isoDateInZone(now, timeZone) : null;
    return runJob(name, runKey, () => job.run({ now, ...options }));
  }

  return Object.freeze({ run, names: () => [...jobs.keys()], get: (name) => jobs.get(name) });
}
