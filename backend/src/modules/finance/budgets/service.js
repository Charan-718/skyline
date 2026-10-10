import { appError } from '../../../shared/errors.js';
import { record as auditRecord } from '../../../shared/audit.js';
import { budgetFigures } from '../domain/formulas.js';
import * as repository from './repository.js';

// Budgets (LLD §2.10, §4.9; T-82). Periods of one club never overlap — checked on create and
// update under a per-club advisory lock (BUDGET_PERIOD_OVERLAP).

export function createBudgetService({ db, withTransaction, access, timeZone }) {
  async function figures(conn, budget) {
    const period = { periodStart: budget.period_start, periodEnd: budget.period_end };
    const [spent, committed] = await Promise.all([
      repository.spentInPeriod(conn, budget.club_id, period, timeZone),
      repository.committedInPeriod(conn, budget.club_id, period),
    ]);
    return budgetFigures({ amount: budget.amount_paise, spent, committed });
  }

  async function list(clubId) {
    const budgets = await repository.listBudgets(db, clubId);
    return Promise.all(budgets.map(async (b) => ({ budget: b, figures: await figures(db, b) })));
  }

  async function assertNoOverlap(trx, clubId, period, excludeId) {
    await repository.lockClubBudgets(trx, clubId);
    const clash = await repository.findOverlap(trx, clubId, period, excludeId);
    if (clash) {
      throw appError('BUDGET_PERIOD_OVERLAP', {
        budgetId: clash.id,
        name: clash.name,
        periodStart: clash.period_start,
        periodEnd: clash.period_end,
      });
    }
  }

  async function create(actor, clubId, dto, { requestId } = {}) {
    return withTransaction(async (trx) => {
      await assertNoOverlap(trx, clubId, dto);
      const budget = await repository.insertBudget(trx, {
        club_id: clubId,
        name: dto.name,
        period_start: dto.periodStart,
        period_end: dto.periodEnd,
        amount_paise: dto.amountPaise,
        notes: dto.notes ?? null,
        created_by: actor.userId,
      });
      await auditRecord(trx, { actorUserId: actor.userId, clubId, action: 'BUDGET_CREATED', entityType: 'budget', entityId: budget.id, metadata: dto, requestId });
      return { budget, figures: await figures(trx, budget) };
    });
  }

  async function update(actor, budgetId, patch, { requestId } = {}) {
    const current = await repository.findBudget(db, budgetId);
    if (!current) throw appError('NOT_FOUND');
    await access.requireRole(actor, current.club_id, ['TREASURER']);
    const period = { periodStart: patch.periodStart ?? current.period_start, periodEnd: patch.periodEnd ?? current.period_end };
    if (period.periodEnd < period.periodStart) {
      throw appError('VALIDATION_FAILED', { fields: [{ path: 'periodEnd', message: 'periodEnd must be on or after periodStart' }] });
    }
    return withTransaction(async (trx) => {
      await assertNoOverlap(trx, current.club_id, period, budgetId);
      const changes = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.periodStart !== undefined) changes.period_start = patch.periodStart;
      if (patch.periodEnd !== undefined) changes.period_end = patch.periodEnd;
      if (patch.amountPaise !== undefined) changes.amount_paise = patch.amountPaise;
      if (patch.notes !== undefined) changes.notes = patch.notes;
      const budget = await repository.updateBudget(trx, budgetId, changes);
      await auditRecord(trx, { actorUserId: actor.userId, clubId: current.club_id, action: 'BUDGET_UPDATED', entityType: 'budget', entityId: budgetId, metadata: patch, requestId });
      return { budget, figures: await figures(trx, budget) };
    });
  }

  /** The budget covering `date` with its figures, or null (finance summary activeBudget). */
  async function activeOn(clubId, date) {
    const b = await repository.budgetCoveringDate(db, clubId, date);
    return b ? { budget: b, figures: await figures(db, b) } : null;
  }

  return Object.freeze({ list, create, update, activeOn });
}
