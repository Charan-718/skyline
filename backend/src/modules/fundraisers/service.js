import { appError } from '../../shared/errors.js';
import { CLUB_ROLES } from '../../shared/access.js';
import { isFundraiserClosed, isOverdue, planFundraiserPatch, planTaskPatch } from './domain/fundraiserRules.js';
import { computeMoney, computeProgress } from './domain/progress.js';
import * as repository from './repository.js';

// Fundraisers & tasks (LLD §2.9, §4.8, §5.13).

function fail({ code, details }) {
  return appError(code, details);
}

export function createFundraiserService({ db, clock, access, clubs, auth, fundraiserMoney, timeZone, tolerancePct }) {
  async function loadFundraiser(id) {
    const f = await repository.findFundraiser(db, id);
    if (!f) throw appError('NOT_FOUND');
    return f;
  }

  async function assertAssignee(userId, clubId) {
    if (userId && !(await clubs.hasClubRole(userId, clubId, CLUB_ROLES))) throw appError('ASSIGNEE_NOT_IN_CLUB');
  }

  async function namesOf(userIds) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Map();
    return new Map((await auth.getUsersByIds(ids)).map((u) => [u.id, u.fullName]));
  }

  function progressOf(fundraiser, tasks) {
    return computeProgress({ fundraiser, tasks, now: clock.now(), today: clock.todayIST(), timeZone, tolerancePct });
  }

  /** Club-role list with progressPct and health per fundraiser (LLD §4.8 TEAM; organizers excluded, OQ-38). */
  async function list(clubId, query) {
    const fundraisers = await repository.listFundraisers(db, clubId, query);
    const ids = fundraisers.map((f) => f.id);
    const tasks = await repository.listTasksOfFundraisers(db, ids);
    const moneyById = ids.length ? await fundraiserMoney(ids) : new Map();
    return fundraisers.map((f) => {
      const p = progressOf(f, tasks.filter((t) => t.fundraiser_id === f.id));
      const money = computeMoney(f, moneyById.get(f.id) ?? { income: 0, expensesPaid: 0 });
      return { fundraiser: f, progress: p, money };
    });
  }

  async function listAssignees(clubId) {
    const rows = await db('club_role_assignments as cra')
      .join('users as u', 'u.id', 'cra.user_id')
      .where('cra.club_id', clubId)
      .whereNull('cra.revoked_at')
      .select('u.id as user_id', 'u.full_name')
      .orderBy('u.full_name');
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      out.push({ userId: r.user_id, fullName: r.full_name });
    }
    return out;
  }

  /** GET /fundraisers/:id/overview (club roles; organizers excluded, OQ-38). */
  async function overview(actor, id) {
    const fundraiser = await getForTeam(actor, id);
    const tasks = await repository.listTasksOfFundraisers(db, [id]);
    const p = progressOf(fundraiser, tasks);
    const money = computeMoney(fundraiser, (await fundraiserMoney([id])).get(id));
    const standing = await access.standing(actor.userId, fundraiser.club_id);
    const assignees = await listAssignees(fundraiser.club_id);
    return {
      fundraiser,
      tasks,
      progress: p,
      money,
      names: await namesOf(tasks.map((t) => t.assignee_user_id)),
      viewerIsClubHead: standing.roles.has('CLUB_HEAD'),
      assignees,
    };
  }

  async function create(actor, clubId, dto) {
    return repository.insertFundraiser(db, {
      club_id: clubId,
      name: dto.name,
      description: dto.description,
      starts_on: dto.startsOn,
      target_date: dto.targetDate,
      goal_amount_paise: dto.goalAmountPaise ?? null,
      status: 'PLANNING',
      created_by: actor.userId,
    });
  }

  /** CH of the fundraiser's club; anyone else in the club 403, outside 404. */
  async function update(actor, id, patch) {
    const f = await loadFundraiser(id);
    await access.requireRole(actor, f.club_id, ['CLUB_HEAD']);
    const plan = planFundraiserPatch(f, patch, clock.now());
    if (plan.error) throw fail(plan.error);
    if (!Object.keys(plan.changes).length) return f;
    const updated = await repository.updateFundraiserIfStatus(db, id, f.status, plan.changes);
    if (!updated) throw appError('CONFLICT_STATE', { currentStatus: (await loadFundraiser(id)).status });
    return updated;
  }

  async function getForTeam(actor, id) {
    const f = await loadFundraiser(id);
    await access.requireRole(actor, f.club_id, CLUB_ROLES);
    return f;
  }

  async function createTask(actor, fundraiserId, dto) {
    const f = await loadFundraiser(fundraiserId);
    await access.requireRole(actor, f.club_id, ['CLUB_HEAD']);
    if (isFundraiserClosed(f.status)) throw appError('FUNDRAISER_CLOSED', { fundraiserStatus: f.status });
    await assertAssignee(dto.assigneeUserId, f.club_id);
    const task = await repository.insertTask(db, {
      fundraiser_id: f.id,
      club_id: f.club_id,
      title: dto.title,
      description: dto.description,
      assignee_user_id: dto.assigneeUserId ?? null,
      deadline: dto.deadline,
      status: 'TODO',
      progress_percent: 0,
      created_by: actor.userId,
    });
    return { task, names: await namesOf([task.assignee_user_id]) };
  }

  /**
   * CH: every field. Assignee (holding an active club role, OQ-40): status and progressPercent of
   * their own task. Anyone else: 404 (TC-FUN-02).
   */
  async function updateTask(actor, taskId, patch) {
    const task = await repository.findTask(db, taskId);
    if (!task) throw appError('NOT_FOUND');
    const standing = await access.standing(actor.userId, task.club_id);
    const isHead = standing.roles.has('CLUB_HEAD');
    const isAssignee = task.assignee_user_id === actor.userId && CLUB_ROLES.some((r) => standing.roles.has(r));
    if (!isHead && !isAssignee) throw appError('NOT_FOUND');

    const plan = planTaskPatch(task, patch, { isHead, now: clock.now() });
    if (plan.error) throw fail(plan.error);
    const f = await loadFundraiser(task.fundraiser_id);
    if (isFundraiserClosed(f.status)) throw appError('FUNDRAISER_CLOSED', { fundraiserStatus: f.status });
    if (plan.changes.assignee_user_id) await assertAssignee(plan.changes.assignee_user_id, task.club_id);

    let updated = task;
    if (Object.keys(plan.changes).length) {
      updated = await repository.updateTaskIfStatus(db, taskId, task.status, plan.changes);
      if (!updated) throw appError('CONFLICT_STATE', { currentStatus: (await repository.findTask(db, taskId)).status });
    }
    return { task: updated, names: await namesOf([updated.assignee_user_id]) };
  }

  async function myTasks(actor, query) {
    const now = clock.now();
    const rows = await repository.listTasksOfAssignee(db, actor.userId, query);
    return { rows: rows.map((t) => ({ ...t, overdue: isOverdue(t, now) })), names: await namesOf([actor.userId]) };
  }

  /**
   * { clubId, status } of a fundraiser, or null — injected into finance (OQ-25) for
   * FUNDRAISER_NOT_IN_CLUB and FUNDRAISER_CLOSED (OQ-53).
   */
  async function getFundraiserRef(fundraiserId) {
    const f = await repository.findFundraiser(db, fundraiserId);
    return f ? { clubId: f.club_id, status: f.status } : null;
  }

  return Object.freeze({ list, overview, create, update, getForTeam, createTask, updateTask, myTasks, getFundraiserRef, namesOf });
}
