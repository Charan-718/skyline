import { describe, expect, it } from 'vitest';
import { computeMoney, computeProgress } from '../../src/modules/fundraisers/domain/progress.js';

// TC-FUN-01 — task progress & health (LLD §2.9). Expected values are hand-computed below.
//
// Clock: now = 2026-11-01T10:00+05:30, today (IST) = 2026-11-01.
// Fundraiser window: startsOn 2026-10-01 00:00 IST → end of targetDate 2026-11-30 (= 2026-12-01 00:00 IST)
//   total   = 61 days = 1464 h
//   elapsed = 31 days + 10 h = 754 h
//   timeElapsedPct = 754 / 1464 × 100 = 51.502… → 52 (displayed, half-up)
//   AT_RISK threshold with tolerance 20: progressPct < 31.502… ⇒ 31 is AT_RISK, 32 is ON_TRACK.

const now = new Date('2026-11-01T10:00:00+05:30');
const today = '2026-11-01';
const timeZone = 'Asia/Kolkata';
const future = '2026-11-20T00:00:00Z';
const past = '2026-10-25T00:00:00Z';

const fundraiser = (extra = {}) => ({ status: 'ACTIVE', starts_on: '2026-10-01', target_date: '2026-11-30', goal_amount_paise: null, ...extra });
let n = 0;
const task = (status, progress, deadline = future) => ({ id: `t${(n += 1)}`, status, progress_percent: progress, deadline });

const run = (f, tasks, tolerancePct = 20) => computeProgress({ fundraiser: f, tasks, now, today, timeZone, tolerancePct });

describe('TC-FUN-01 fundraiser health', () => {
  it.each([
    ['ON_TRACK at 32% (just above 51.50 − 20)', fundraiser(), [task('IN_PROGRESS', 32)], 'ON_TRACK'],
    ['AT_RISK at 31% (just below 51.50 − 20)', fundraiser(), [task('IN_PROGRESS', 31)], 'AT_RISK'],
    ['OFF_TRACK: one overdue TODO task outweighs good progress', fundraiser(), [task('DONE', 100), task('TODO', 0, past)], 'OFF_TRACK'],
    ['OFF_TRACK: overdue IN_PROGRESS task', fundraiser(), [task('IN_PROGRESS', 90, past)], 'OFF_TRACK'],
    ['not overdue: DONE task with a past deadline', fundraiser(), [task('DONE', 100, past)], 'ON_TRACK'],
    ['OFF_TRACK: target date passed with progress < 100', fundraiser({ target_date: '2026-10-31' }), [task('IN_PROGRESS', 90)], 'OFF_TRACK'],
    ['ON_TRACK: target date passed but 100% done', fundraiser({ target_date: '2026-10-31' }), [task('DONE', 100, past)], 'ON_TRACK'],
    ['NO_TASKS: no tasks at all', fundraiser(), [], 'NO_TASKS'],
    ['NO_TASKS: only cancelled tasks', fundraiser(), [task('CANCELLED', 0, past)], 'NO_TASKS'],
    ['COMPLETED wins over everything', fundraiser({ status: 'COMPLETED' }), [task('TODO', 0, past)], 'COMPLETED'],
    ['CANCELLED wins over everything', fundraiser({ status: 'CANCELLED' }), [], 'CANCELLED'],
    ['PLANNING fundraisers use the same rules', fundraiser({ status: 'PLANNING' }), [task('TODO', 0)], 'AT_RISK'],
  ])('%s', (_name, f, tasks, expected) => {
    expect(run(f, tasks).health).toBe(expected);
  });

  it('tolerance comes from configuration (0 makes 51% AT_RISK, 52% ON_TRACK)', () => {
    expect(run(fundraiser(), [task('IN_PROGRESS', 51)], 0).health).toBe('AT_RISK');
    expect(run(fundraiser(), [task('IN_PROGRESS', 52)], 0).health).toBe('ON_TRACK');
    expect(run(fundraiser(), [task('IN_PROGRESS', 10)], 50).health).toBe('ON_TRACK');
  });

  it('timeElapsedPct = 52 here; 0 before start; 100 after target', () => {
    expect(run(fundraiser(), []).timeElapsedPct).toBe(52);
    expect(run(fundraiser({ starts_on: '2026-12-01', target_date: '2026-12-31' }), []).timeElapsedPct).toBe(0);
    expect(run(fundraiser({ starts_on: '2026-09-01', target_date: '2026-10-15' }), []).timeElapsedPct).toBe(100);
  });

  it('single-day fundraiser: startsOn = targetDate is a 24 h window, never a division by zero', () => {
    // 2026-11-01 00:00 → 2026-11-02 00:00 IST; now is 10:00 → 10/24 = 41.67% → 42
    expect(run(fundraiser({ starts_on: '2026-11-01', target_date: '2026-11-01' }), []).timeElapsedPct).toBe(42);
  });

  it('progressPct = round(Σ progress / active tasks); cancelled excluded; counts per status', () => {
    const r = run(fundraiser(), [task('IN_PROGRESS', 33), task('IN_PROGRESS', 34), task('CANCELLED', 90), task('TODO', 0, past), task('DONE', 100)]);
    // active: 33 + 34 + 0 + 100 = 167 / 4 = 41.75 → 42
    expect(r.progressPct).toBe(42);
    expect(r.counts).toEqual({ todo: 1, inProgress: 2, done: 1, cancelled: 1, overdue: 1 });
    expect(run(fundraiser(), [task('IN_PROGRESS', 33), task('IN_PROGRESS', 34)]).progressPct).toBe(34); // 33.5 → 34 half-up
    expect(run(fundraiser(), []).progressPct).toBe(0);
  });
});

describe('fundraiser money', () => {
  it('net and goalPct (half-up integer percent); null goal → null', () => {
    expect(computeMoney({ goal_amount_paise: 300000 }, { income: 100000, expensesPaid: 25000 })).toEqual({
      income: 100000,
      expensesPaid: 25000,
      net: 75000,
      goalPct: 33, // 33.33…
    });
    expect(computeMoney({ goal_amount_paise: 200000 }, { income: 300000, expensesPaid: 0 }).goalPct).toBe(150);
    expect(computeMoney({ goal_amount_paise: null }, { income: 5, expensesPaid: 10 })).toEqual({ income: 5, expensesPaid: 10, net: -5, goalPct: null });
  });
});
