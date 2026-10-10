// Fundraiser and task rules (LLD §2.9, §5.13). Pure: no I/O. Functions return
// { error: { code, details } } or a plan; the service turns errors into AppErrors.

export const FUNDRAISER_STATUSES = Object.freeze(['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED']);
export const TASK_STATUSES = Object.freeze(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);

const FUNDRAISER_TRANSITIONS = Object.freeze({
  PLANNING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
});

/** overdue(task) = status ∈ {TODO, IN_PROGRESS} ∧ deadline < now (LLD §2.9). */
export const isOverdue = (task, now) =>
  (task.status === 'TODO' || task.status === 'IN_PROGRESS') && new Date(task.deadline).getTime() < now.getTime();

export const isFundraiserClosed = (status) => status === 'COMPLETED' || status === 'CANCELLED';

const conflict = (currentStatus) => ({ error: { code: 'CONFLICT_STATE', details: { currentStatus } } });

/**
 * Fundraiser PATCH (club head). Closed fundraisers are read-only (OQ-39).
 * patch keys: name, description, startsOn, targetDate, goalAmountPaise, status.
 */
export function planFundraiserPatch(fundraiser, patch, now) {
  if (isFundraiserClosed(fundraiser.status)) return conflict(fundraiser.status);
  const changes = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.description !== undefined) changes.description = patch.description;
  if (patch.startsOn !== undefined) changes.starts_on = patch.startsOn;
  if (patch.targetDate !== undefined) changes.target_date = patch.targetDate;
  if (patch.goalAmountPaise !== undefined) changes.goal_amount_paise = patch.goalAmountPaise;
  if (patch.status !== undefined && patch.status !== fundraiser.status) {
    if (!FUNDRAISER_TRANSITIONS[fundraiser.status].includes(patch.status)) return conflict(fundraiser.status);
    changes.status = patch.status;
    if (patch.status === 'COMPLETED') changes.completed_at = now;
  }
  const startsOn = changes.starts_on ?? fundraiser.starts_on;
  const targetDate = changes.target_date ?? fundraiser.target_date;
  if (targetDate < startsOn) {
    return { error: { code: 'VALIDATION_FAILED', details: { fields: [{ path: 'targetDate', message: 'targetDate must be on or after startsOn' }] } } };
  }
  return { changes };
}

const HEAD_ONLY_FIELDS = Object.freeze(['title', 'description', 'deadline', 'assigneeUserId']);

// from -> to -> who may do it
const TASK_TRANSITIONS = Object.freeze({
  TODO: { IN_PROGRESS: 'ANY', DONE: 'ANY', CANCELLED: 'HEAD' },
  IN_PROGRESS: { DONE: 'ANY', CANCELLED: 'HEAD' },
  DONE: { IN_PROGRESS: 'HEAD' },
  CANCELLED: {},
});

/**
 * Task PATCH (LLD §2.9 transition table, §5.13). `isHead` = actor is club head of the club;
 * otherwise the actor is the assignee and may change only status and progressPercent.
 *   - DONE forces progressPercent 100 and sets completedAt; reopening clears completedAt.
 *   - progressPercent > 0 on a TODO task moves it to IN_PROGRESS.
 *   - CANCELLED is terminal; a DONE task's progress changes only by reopening it.
 */
export function planTaskPatch(task, patch, { isHead, now }) {
  const keys = Object.keys(patch);
  if (!isHead) {
    const forbidden = keys.filter((k) => HEAD_ONLY_FIELDS.includes(k));
    if (forbidden.length) return { error: { code: 'FIELD_NOT_EDITABLE', details: { fields: forbidden } } };
  }
  if (task.status === 'CANCELLED') return conflict(task.status);

  const changes = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.description !== undefined) changes.description = patch.description;
  if (patch.deadline !== undefined) changes.deadline = patch.deadline;
  if (patch.assigneeUserId !== undefined) changes.assignee_user_id = patch.assigneeUserId;

  let status = task.status;
  if (patch.status !== undefined && patch.status !== task.status) {
    const who = TASK_TRANSITIONS[task.status][patch.status];
    if (!who) return conflict(task.status);
    if (who === 'HEAD' && !isHead) return { error: { code: 'FORBIDDEN', details: { reason: 'CLUB_HEAD_ONLY_TRANSITION' } } };
    status = patch.status;
  }

  let progress = patch.progressPercent ?? task.progress_percent;
  if (task.status === 'DONE' && status === 'DONE' && patch.progressPercent !== undefined && patch.progressPercent !== 100) {
    return conflict(task.status);
  }
  if (status === 'TODO' && progress > 0) status = 'IN_PROGRESS';
  if (status === 'DONE') progress = 100;

  if (status !== task.status) {
    changes.status = status;
    if (status === 'DONE') changes.completed_at = now;
    if (task.status === 'DONE') changes.completed_at = null;
  }
  if (progress !== task.progress_percent) changes.progress_percent = progress;
  return { changes };
}
