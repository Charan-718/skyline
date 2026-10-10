// JSON shapes (camelCase; dates YYYY-MM-DD; instants ISO-8601 UTC; money integer paise).
const iso = (v) => (v ? new Date(v).toISOString() : null);

export function toFundraiserDto(f) {
  return {
    id: f.id,
    clubId: f.club_id,
    name: f.name,
    description: f.description,
    startsOn: f.starts_on,
    targetDate: f.target_date,
    goalAmountPaise: f.goal_amount_paise,
    status: f.status,
    createdAt: iso(f.created_at),
    updatedAt: iso(f.updated_at),
    completedAt: iso(f.completed_at),
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
