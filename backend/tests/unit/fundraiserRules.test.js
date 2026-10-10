import { describe, expect, it } from 'vitest';
import { isOverdue, planFundraiserPatch, planTaskPatch } from '../../src/modules/fundraisers/domain/fundraiserRules.js';

const now = new Date('2026-11-01T04:30:00Z');
const f = (status, extra = {}) => ({ status, starts_on: '2026-10-01', target_date: '2026-12-31', ...extra });
const t = (status, progress = status === 'DONE' ? 100 : 0, extra = {}) => ({ status, progress_percent: progress, deadline: '2026-11-15T00:00:00Z', ...extra });

describe('fundraiser transitions (LLD §2.9)', () => {
  it.each([
    ['PLANNING', 'ACTIVE', true],
    ['PLANNING', 'CANCELLED', true],
    ['ACTIVE', 'COMPLETED', true],
    ['ACTIVE', 'CANCELLED', true],
    ['PLANNING', 'COMPLETED', false],
    ['ACTIVE', 'PLANNING', false],
  ])('%s → %s allowed=%s', (from, to, ok) => {
    const plan = planFundraiserPatch(f(from), { status: to }, now);
    if (ok) expect(plan.changes.status).toBe(to);
    else expect(plan.error).toEqual({ code: 'CONFLICT_STATE', details: { currentStatus: from } });
  });

  it('COMPLETED sets completed_at; closed fundraisers are read-only', () => {
    expect(planFundraiserPatch(f('ACTIVE'), { status: 'COMPLETED' }, now).changes.completed_at).toBe(now);
    for (const closed of ['COMPLETED', 'CANCELLED']) {
      expect(planFundraiserPatch(f(closed), { name: 'x' }, now).error.code).toBe('CONFLICT_STATE');
    }
  });

  it('targetDate stays on or after startsOn across partial updates', () => {
    expect(planFundraiserPatch(f('PLANNING'), { targetDate: '2026-09-30' }, now).error.code).toBe('VALIDATION_FAILED');
    expect(planFundraiserPatch(f('PLANNING'), { startsOn: '2027-01-01' }, now).error.code).toBe('VALIDATION_FAILED');
    expect(planFundraiserPatch(f('PLANNING'), { startsOn: '2026-12-31' }, now).changes).toEqual({ starts_on: '2026-12-31' });
  });
});

describe('task transitions (LLD §2.9, §5.13)', () => {
  const head = { isHead: true, now };
  const assignee = { isHead: false, now };

  it('assignee may change only status and progressPercent', () => {
    for (const field of ['title', 'description', 'deadline', 'assigneeUserId']) {
      expect(planTaskPatch(t('TODO'), { [field]: 'x' }, assignee).error).toEqual({ code: 'FIELD_NOT_EDITABLE', details: { fields: [field] } });
    }
    expect(planTaskPatch(t('TODO'), { title: 'x' }, head).changes).toEqual({ title: 'x' });
  });

  it('TODO → IN_PROGRESS by start or by progress > 0', () => {
    expect(planTaskPatch(t('TODO'), { status: 'IN_PROGRESS' }, assignee).changes).toEqual({ status: 'IN_PROGRESS' });
    expect(planTaskPatch(t('TODO'), { progressPercent: 30 }, assignee).changes).toEqual({ status: 'IN_PROGRESS', progress_percent: 30 });
    expect(planTaskPatch(t('TODO'), { progressPercent: 0 }, assignee).changes).toEqual({});
  });

  it('complete forces 100 and completedAt, from TODO or IN_PROGRESS, by assignee or head', () => {
    for (const from of ['TODO', 'IN_PROGRESS']) {
      for (const who of [head, assignee]) {
        expect(planTaskPatch(t(from, 40), { status: 'DONE', progressPercent: 50 }, who).changes).toEqual({
          status: 'DONE',
          progress_percent: 100,
          completed_at: now,
        });
      }
    }
  });

  it('reopen DONE → IN_PROGRESS is club-head only and clears completedAt', () => {
    expect(planTaskPatch(t('DONE'), { status: 'IN_PROGRESS', progressPercent: 80 }, head).changes).toEqual({
      status: 'IN_PROGRESS',
      completed_at: null,
      progress_percent: 80,
    });
    expect(planTaskPatch(t('DONE'), { status: 'IN_PROGRESS' }, assignee).error.code).toBe('FORBIDDEN');
  });

  it('cancel is club-head only from any non-DONE status; CANCELLED is terminal', () => {
    expect(planTaskPatch(t('TODO'), { status: 'CANCELLED' }, head).changes).toEqual({ status: 'CANCELLED' });
    expect(planTaskPatch(t('IN_PROGRESS', 20), { status: 'CANCELLED' }, head).changes).toEqual({ status: 'CANCELLED' });
    expect(planTaskPatch(t('TODO'), { status: 'CANCELLED' }, assignee).error.code).toBe('FORBIDDEN');
    expect(planTaskPatch(t('DONE'), { status: 'CANCELLED' }, head).error.code).toBe('CONFLICT_STATE');
    expect(planTaskPatch(t('CANCELLED'), { status: 'TODO' }, head).error.code).toBe('CONFLICT_STATE');
    expect(planTaskPatch(t('CANCELLED'), { title: 'x' }, head).error.code).toBe('CONFLICT_STATE');
  });

  it('transitions not in the table are CONFLICT_STATE', () => {
    expect(planTaskPatch(t('IN_PROGRESS', 10), { status: 'TODO' }, head).error).toEqual({ code: 'CONFLICT_STATE', details: { currentStatus: 'IN_PROGRESS' } });
    expect(planTaskPatch(t('DONE'), { progressPercent: 50 }, assignee).error.code).toBe('CONFLICT_STATE');
  });

  it('overdue = TODO/IN_PROGRESS with deadline before now', () => {
    expect(isOverdue(t('TODO', 0, { deadline: '2026-10-31T00:00:00Z' }), now)).toBe(true);
    expect(isOverdue(t('IN_PROGRESS', 5, { deadline: '2026-10-31T00:00:00Z' }), now)).toBe(true);
    expect(isOverdue(t('DONE', 100, { deadline: '2026-10-31T00:00:00Z' }), now)).toBe(false);
    expect(isOverdue(t('TODO', 0, { deadline: now.toISOString() }), now)).toBe(false);
  });
});
