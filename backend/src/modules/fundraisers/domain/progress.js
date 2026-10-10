import { addDays, startOfDay, toIsoDateString } from '../../../shared/dates.js';
import { clamp, divRoundHalfUp } from '../../../shared/intMath.js';
import { isOverdue } from './fundraiserRules.js';

// Fundraiser progress and health (LLD §2.9). Pure: integers only, time passed in.
//   activeTasks    = tasks with status ≠ CANCELLED
//   progressPct    = activeTasks.length ? round(Σ progressPercent / activeTasks.length) : 0
//   timeElapsedPct = clamp(0, 100, (now − startsOn) / (targetDate − startsOn) × 100)
//                    startsOn = 00:00 of startsOn, targetDate = end of targetDate (OQ-41)
//   health         COMPLETED/CANCELLED -> same; no active tasks -> NO_TASKS;
//                  any overdue task or (today > targetDate ∧ progressPct < 100) -> OFF_TRACK;
//                  progressPct < timeElapsedPct − tolerance -> AT_RISK; else ON_TRACK.
//   money          income = Σ IN FUNDRAISER_INCOME, expensesPaid = Σ OUT, net, goalPct (OQ-42).

export const HEALTH = Object.freeze(['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NO_TASKS', 'COMPLETED', 'CANCELLED']);

function elapsed(fundraiser, now, timeZone) {
  const startsOn = toIsoDateString(fundraiser.starts_on);
  const targetDate = toIsoDateString(fundraiser.target_date);
  const start = startOfDay(startsOn, timeZone).getTime();
  const end = startOfDay(addDays(targetDate, 1), timeZone).getTime();
  const total = end - start;
  const done = clamp(0, total, now.getTime() - start);
  return { done, total };
}

export function computeProgress({ fundraiser, tasks, now, today, timeZone, tolerancePct }) {
  const active = tasks.filter((t) => t.status !== 'CANCELLED');
  const progressSum = active.reduce((s, t) => s + t.progress_percent, 0);
  const progressPct = active.length ? divRoundHalfUp(progressSum, active.length) : 0;

  const { done, total } = elapsed(fundraiser, now, timeZone);
  const timeElapsedPct = divRoundHalfUp(done * 100, total);

  const overdueIds = new Set(tasks.filter((t) => isOverdue(t, now)).map((t) => t.id));
  const counts = {
    todo: tasks.filter((t) => t.status === 'TODO').length,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    done: tasks.filter((t) => t.status === 'DONE').length,
    cancelled: tasks.filter((t) => t.status === 'CANCELLED').length,
    overdue: overdueIds.size,
  };

  let health;
  if (fundraiser.status === 'COMPLETED' || fundraiser.status === 'CANCELLED') health = fundraiser.status;
  else if (!active.length) health = 'NO_TASKS';
  else if (overdueIds.size > 0 || (today > toIsoDateString(fundraiser.target_date) && progressPct < 100)) health = 'OFF_TRACK';
  // progressPct < elapsed% − tolerance, compared exactly: progressPct·total < 100·done − tolerance·total
  else if (BigInt(progressPct) * BigInt(total) < 100n * BigInt(done) - BigInt(tolerancePct) * BigInt(total)) health = 'AT_RISK';
  else health = 'ON_TRACK';

  return { progressPct, timeElapsedPct, health, counts, overdueIds };
}

export function computeMoney(fundraiser, { income, expensesPaid }) {
  const inc = Number(income) || 0;
  const exp = Number(expensesPaid) || 0;
  const goal = fundraiser.goal_amount_paise != null ? Number(fundraiser.goal_amount_paise) : null;
  return {
    income: inc,
    expensesPaid: exp,
    net: inc - exp,
    goalPct: goal != null && goal > 0 ? divRoundHalfUp(inc * 100, goal) : null,
  };
}
