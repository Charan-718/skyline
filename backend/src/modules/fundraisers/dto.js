import { toIsoDateString } from '../../shared/dates.js';

// JSON shapes (camelCase; dates YYYY-MM-DD; instants ISO-8601 UTC; money integer paise).
const iso = (v) => (v ? new Date(v).toISOString() : null);

export function toFundraiserDto(f) {
  return {
    id: f.id,
    clubId: f.club_id,
    name: f.name,
    description: f.description,
    startsOn: toIsoDateString(f.starts_on),
    targetDate: toIsoDateString(f.target_date),
    goalAmountPaise: f.goal_amount_paise,
    status: f.status,
    createdAt: iso(f.created_at),
    updatedAt: iso(f.updated_at),
    completedAt: iso(f.completed_at),
  };
}

/** Frontend/mock list shape (camelCase money fields). */
export function toFundraiserMoneyDto(m) {
  return {
    incomePaise: m.income ?? 0,
    expensesPaidPaise: m.expensesPaid ?? 0,
    netPaise: m.net ?? (m.income ?? 0) - (m.expensesPaid ?? 0),
    goalPct: m.goalPct ?? null,
  };
}

export function toFundraiserListItem(f, { progress, money }) {
  return {
    ...toFundraiserDto(f),
    progressPct: progress.progressPct,
    timeElapsedPct: progress.timeElapsedPct,
    health: progress.health,
    counts: progress.counts,
    money: toFundraiserMoneyDto(money),
  };
}

export function toTaskDto(t, names = new Map(), { overdue } = {}) {
  return {
    id: t.id,
    fundraiserId: t.fundraiser_id,
    clubId: t.club_id,
    title: t.title,
    description: t.description,
    assignee: t.assignee_user_id ? { id: t.assignee_user_id, fullName: names.get(t.assignee_user_id) ?? null } : null,
    deadline: iso(t.deadline),
    status: t.status,
    progressPercent: t.progress_percent,
    ...(overdue === undefined ? {} : { overdue }),
    createdAt: iso(t.created_at),
    updatedAt: iso(t.updated_at),
    completedAt: iso(t.completed_at),
  };
}
