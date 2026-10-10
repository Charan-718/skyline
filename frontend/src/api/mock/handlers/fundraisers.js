import { err, fundraiserProgress, nowIso, uid } from '../domain';
import { audit } from '../ops';
import { clubOf, created, findOr404, hasRole, ok, requireClubRole, requireUser, userName } from './shared';

const TRANSITIONS = { PLANNING: ['ACTIVE', 'CANCELLED'], ACTIVE: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] };

function taskView(db, t, isOverdue) {
  return { ...t, assigneeName: userName(db, t.assigneeUserId), overdue: isOverdue(t) };
}

function summary(db, f) {
  const p = fundraiserProgress(db, f);
  return { ...f, progressPct: p.progressPct, timeElapsedPct: p.timeElapsedPct, health: p.health, counts: p.counts, money: p.money };
}

export const routes = [
  ['GET', '/clubs/:clubId/fundraisers', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, 'TEAM');
    return ok(ctx.db.fundraisers.filter((f) => f.clubId === ctx.params.clubId && (!ctx.query.status || f.status === ctx.query.status)).sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1)).map((f) => summary(ctx.db, f)));
  }],
  ['POST', '/clubs/:clubId/fundraisers', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { body } = ctx;
    const f = {};
    if (!body.name || !body.name.trim()) f.name = 'Enter a name.';
    if (!body.startsOn) f.startsOn = 'Required.';
    if (!body.targetDate) f.targetDate = 'Required.';
    if (body.startsOn && body.targetDate && body.targetDate <= body.startsOn) f.targetDate = 'Must be after the start date.';
    if (body.goalAmountPaise != null && (!Number.isInteger(body.goalAmountPaise) || body.goalAmountPaise <= 0)) f.goalAmountPaise = 'Goal must be more than zero.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    const row = { id: uid('fnd'), clubId: ctx.params.clubId, name: body.name.trim(), description: body.description || '', startsOn: body.startsOn, targetDate: body.targetDate, goalAmountPaise: body.goalAmountPaise ?? null, status: 'PLANNING', createdBy: actor.id, createdAt: nowIso() };
    ctx.db.fundraisers.push(row);
    return created(summary(ctx.db, row));
  }],
  ['PATCH', '/fundraisers/:id', (ctx) => {
    const fr = findOr404(ctx.db.fundraisers, ctx.params.id, 'Fundraiser');
    const actor = requireClubRole(ctx, fr.clubId, ['CLUB_HEAD']);
    if (ctx.body.status && ctx.body.status !== fr.status) {
      if (!TRANSITIONS[fr.status].includes(ctx.body.status)) throw err(409, 'CONFLICT_STATE', `A ${fr.status.toLowerCase()} fundraiser cannot become ${ctx.body.status.toLowerCase()}.`, { currentStatus: fr.status });
      fr.status = ctx.body.status;
      audit(ctx.db, actor.id, 'FUNDRAISER_STATUS', 'fundraiser', fr.id, { status: fr.status });
    }
    ['name', 'description', 'startsOn', 'targetDate', 'goalAmountPaise'].forEach((k) => {
      if (ctx.body[k] !== undefined) fr[k] = ctx.body[k];
    });
    return ok(summary(ctx.db, fr));
  }],
  ['GET', '/fundraisers/:id/overview', (ctx) => {
    const fr = findOr404(ctx.db.fundraisers, ctx.params.id, 'Fundraiser');
    const user = requireClubRole(ctx, fr.clubId, 'TEAM');
    const p = fundraiserProgress(ctx.db, fr);
    const tasks = ctx.db.tasks.filter((t) => t.fundraiserId === fr.id).sort((a, b) => (a.deadline < b.deadline ? -1 : 1)).map((t) => taskView(ctx.db, t, p.isOverdue));
    return ok({
      fundraiser: { ...fr, clubName: clubOf(ctx.db, fr.clubId)?.name },
      progressPct: p.progressPct, health: p.health, timeElapsedPct: p.timeElapsedPct, counts: p.counts, money: p.money, tasks,
      viewerIsClubHead: hasRole(ctx.db, user.id, fr.clubId, ['CLUB_HEAD']),
      assignees: ctx.db.roles.filter((r) => r.clubId === fr.clubId && !r.revokedAt).reduce((acc, r) => (acc.some((a) => a.userId === r.userId) ? acc : acc.concat({ userId: r.userId, fullName: userName(ctx.db, r.userId) })), []),
    });
  }],
  ['POST', '/fundraisers/:id/tasks', (ctx) => {
    const fr = findOr404(ctx.db.fundraisers, ctx.params.id, 'Fundraiser');
    requireClubRole(ctx, fr.clubId, ['CLUB_HEAD']);
    const { body } = ctx;
    if (['COMPLETED', 'CANCELLED'].includes(fr.status)) throw err(409, 'FUNDRAISER_CLOSED', 'Tasks cannot be added to a closed fundraiser.');
    const f = {};
    if (!body.title || !body.title.trim()) f.title = 'Enter a task title.';
    if (!body.deadline) f.deadline = 'Set a deadline.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    if (body.assigneeUserId && !ctx.db.roles.some((r) => r.clubId === fr.clubId && r.userId === body.assigneeUserId && !r.revokedAt)) throw err(422, 'ASSIGNEE_NOT_IN_CLUB', 'Tasks can only be assigned to club role holders.');
    const t = { id: uid('tsk'), fundraiserId: fr.id, clubId: fr.clubId, title: body.title.trim(), description: body.description || '', assigneeUserId: body.assigneeUserId || null, deadline: body.deadline, status: 'TODO', progressPercent: 0, createdAt: nowIso(), completedAt: null };
    ctx.db.tasks.push(t);
    return created(taskView(ctx.db, t, fundraiserProgress(ctx.db, fr).isOverdue));
  }],
  ['PATCH', '/tasks/:taskId', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const t = findOr404(db.tasks, ctx.params.taskId, 'Task');
    const head = hasRole(db, user.id, t.clubId, ['CLUB_HEAD']);
    const assignee = t.assigneeUserId === user.id;
    if (!head && !assignee) throw err(404, 'NOT_FOUND', 'Task not found.');
    const headOnly = ['title', 'description', 'deadline', 'assigneeUserId'];
    if (!head && headOnly.some((k) => body[k] !== undefined)) throw err(403, 'FIELD_NOT_EDITABLE', 'Only the club head can change the title, deadline or assignee.');
    if (body.status && body.status !== t.status) {
      const allowed = { TODO: ['IN_PROGRESS', 'DONE', 'CANCELLED'], IN_PROGRESS: ['DONE', 'CANCELLED'], DONE: head ? ['IN_PROGRESS'] : [], CANCELLED: [] };
      if (!allowed[t.status].includes(body.status) || (body.status === 'CANCELLED' && !head)) throw err(409, 'CONFLICT_STATE', `Cannot move a task from ${t.status} to ${body.status}.`, { currentStatus: t.status });
      t.status = body.status;
      if (t.status === 'DONE') {
        t.progressPercent = 100;
        t.completedAt = nowIso();
      }
      if (t.status === 'IN_PROGRESS' && t.progressPercent === 100) t.progressPercent = 90;
    }
    if (body.progressPercent !== undefined && t.status !== 'DONE') {
      const pct = Math.max(0, Math.min(100, Math.round(body.progressPercent)));
      t.progressPercent = pct;
      if (pct > 0 && t.status === 'TODO') t.status = 'IN_PROGRESS';
      if (pct === 100) {
        t.status = 'DONE';
        t.completedAt = nowIso();
      }
    }
    headOnly.forEach((k) => {
      if (body[k] !== undefined) t[k] = body[k];
    });
    const fr = db.fundraisers.find((x) => x.id === t.fundraiserId);
    return ok(taskView(db, t, fundraiserProgress(db, fr).isOverdue));
  }],
  ['GET', '/me/tasks', (ctx) => {
    const user = requireUser(ctx);
    const { db } = ctx;
    return ok(db.tasks.filter((t) => t.assigneeUserId === user.id && (!ctx.query.status || t.status === ctx.query.status)).sort((a, b) => (a.deadline < b.deadline ? -1 : 1)).map((t) => {
      const fr = db.fundraisers.find((x) => x.id === t.fundraiserId);
      return { ...taskView(db, t, fundraiserProgress(db, fr).isOverdue), fundraiserName: fr.name, fundraiserStatus: fr.status, clubName: clubOf(db, t.clubId)?.name };
    }));
  }],
];
