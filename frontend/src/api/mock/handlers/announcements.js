import { effectiveStatus, err, nowIso, paginate, uid } from '../domain';
import { audit, enqueue } from '../ops';
import { clubOf, created, findOr404, hasRole, isTeam, noContent, ok, paged, requireClubRole, requireUser, userName } from './shared';

const CATEGORIES = ['MEETING', 'DEADLINE', 'EVENT', 'SCHEDULE_CHANGE', 'GENERAL'];

function canSee(db, user, a) {
  if (a.status !== 'PUBLISHED') return !!user && hasRole(db, user.id, a.clubId, ['CLUB_HEAD']);
  if (a.audience === 'PUBLIC') return true;
  if (!user) return false;
  const m = db.memberships.find((x) => x.userId === user.id && x.clubId === a.clubId);
  return (m && effectiveStatus(m) === 'ACTIVE') || isTeam(db, user.id, a.clubId);
}

function view(db, a) {
  const deliveries = db.deliveries.filter((d) => d.announcementId === a.id);
  return {
    ...a,
    clubName: clubOf(db, a.clubId)?.name,
    eventTitle: a.eventId ? db.events.find((e) => e.id === a.eventId)?.title : null,
    createdByName: userName(db, a.createdBy),
    publishedByName: userName(db, a.publishedBy),
    deliveryCounts: deliveries.reduce((acc, d) => ({ ...acc, [d.status]: (acc[d.status] || 0) + 1 }), { total: deliveries.length }),
  };
}

function validate(body, partial) {
  const f = {};
  if (!partial || body.title !== undefined) if (!body.title || !body.title.trim() || body.title.length > 150) f.title = 'Title is required (max 150 characters).';
  if (!partial || body.body !== undefined) if (!body.body || !body.body.trim() || body.body.length > 5000) f.body = 'Message is required (max 5,000 characters).';
  if (body.category !== undefined && !CATEGORIES.includes(body.category)) f.category = 'Choose a category.';
  if (body.audience !== undefined && !['PUBLIC', 'MEMBERS'].includes(body.audience)) f.audience = 'Choose an audience.';
  if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
}

export const routes = [
  ['GET', '/announcements', ({ db, user, query }) => {
    const rows = db.announcements
      .filter((a) => a.status === 'PUBLISHED' && canSee(db, user, a) && (!query.clubId || a.clubId === query.clubId) && (!query.category || a.category === query.category))
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
      .map((a) => view(db, a));
    return paged(paginate(rows, query));
  }],
  ['GET', '/clubs/:clubId/announcements', ({ db, user, params, query }) => {
    findOr404(db.clubs, params.clubId, 'Club');
    const rows = db.announcements
      .filter((a) => a.clubId === params.clubId && canSee(db, user, a) && (!query.status || a.status === query.status))
      .sort((a, b) => ((a.publishedAt || a.createdAt) < (b.publishedAt || b.createdAt) ? 1 : -1))
      .map((a) => view(db, a));
    return ok(rows);
  }],
  ['GET', '/announcements/:id', ({ db, user, params }) => {
    const a = db.announcements.find((x) => x.id === params.id);
    if (!a || !canSee(db, user, a)) throw err(404, 'NOT_FOUND', 'Announcement not found.');
    return ok(view(db, a));
  }],
  ['POST', '/clubs/:clubId/announcements', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { db, body, params } = ctx;
    validate(body);
    if (body.eventId && !db.events.some((e) => e.id === body.eventId && e.clubId === params.clubId)) throw err(422, 'EVENT_NOT_IN_CLUB', 'The linked event does not belong to this club.');
    const a = { id: uid('ann'), clubId: params.clubId, title: body.title.trim(), body: body.body, category: body.category || 'GENERAL', audience: body.audience || 'PUBLIC', sendEmail: body.sendEmail !== false, eventId: body.eventId || null, status: 'DRAFT', createdBy: actor.id, createdAt: nowIso(), publishedAt: null, publishedBy: null };
    db.announcements.push(a);
    return created(view(db, a));
  }],
  ['PATCH', '/announcements/:id', (ctx) => {
    const a = findOr404(ctx.db.announcements, ctx.params.id, 'Announcement');
    requireClubRole(ctx, a.clubId, ['CLUB_HEAD']);
    if (a.status !== 'DRAFT') throw err(409, 'ANNOUNCEMENT_IMMUTABLE', 'Published announcements are a permanent record and cannot be edited. Publish a correction instead.');
    validate(ctx.body, true);
    ['title', 'body', 'category', 'audience', 'sendEmail', 'eventId'].forEach((k) => {
      if (ctx.body[k] !== undefined) a[k] = ctx.body[k];
    });
    return ok(view(ctx.db, a));
  }],
  ['DELETE', '/announcements/:id', (ctx) => {
    const a = findOr404(ctx.db.announcements, ctx.params.id, 'Announcement');
    requireClubRole(ctx, a.clubId, ['CLUB_HEAD']);
    if (a.status !== 'DRAFT') throw err(409, 'ANNOUNCEMENT_IMMUTABLE', 'Published announcements cannot be deleted.');
    ctx.db.announcements = ctx.db.announcements.filter((x) => x.id !== a.id);
    return noContent();
  }],
  ['POST', '/announcements/:id/publish', (ctx) => {
    const { db } = ctx;
    const a = findOr404(db.announcements, ctx.params.id, 'Announcement');
    const actor = requireClubRole(ctx, a.clubId, ['CLUB_HEAD']);
    if (a.status !== 'DRAFT') throw err(409, 'CONFLICT_STATE', 'This announcement is already published.', { currentStatus: a.status });
    a.status = 'PUBLISHED';
    a.publishedAt = nowIso();
    a.publishedBy = actor.id;
    let recipientsQueued = 0;
    if (a.sendEmail) {
      const recipients = new Set(db.memberships.filter((m) => m.clubId === a.clubId && effectiveStatus(m) === 'ACTIVE').map((m) => m.userId));
      if (a.eventId) db.tickets.filter((t) => t.eventId === a.eventId && ['VALID', 'USED'].includes(t.status)).forEach((t) => recipients.add(t.userId));
      recipients.forEach((userId) => enqueue(db, { userId, template: 'ANNOUNCEMENT', announcementId: a.id, payload: { title: a.title }, dedupeKey: `ann:${a.id}:${userId}` }));
      recipientsQueued = recipients.size;
    }
    audit(db, actor.id, 'ANNOUNCEMENT_PUBLISHED', 'announcement', a.id);
    return ok({ publishedAt: a.publishedAt, recipientsQueued, announcement: view(db, a) });
  }],
  ['GET', '/announcements/:id/deliveries', (ctx) => {
    requireUser(ctx);
    const { db, query } = ctx;
    const a = findOr404(db.announcements, ctx.params.id, 'Announcement');
    requireClubRole(ctx, a.clubId, ['CLUB_HEAD']);
    const all = db.deliveries.filter((d) => d.announcementId === a.id);
    const counts = all.reduce((acc, d) => ({ ...acc, [d.status]: (acc[d.status] || 0) + 1 }), {});
    const rows = all.filter((d) => !query.status || d.status === query.status).map((d) => ({ id: d.id, recipientName: userName(db, d.userId), channel: d.channel, status: d.status, attempts: d.attempts, lastError: d.lastError, createdAt: d.createdAt }));
    return ok({ total: all.length, counts, rows });
  }],
];
