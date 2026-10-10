import { effectiveStatus, err, isVerified, salesStatus } from '../domain';

export const ok = (data, status = 200) => ({ status, data });
export const created = (data) => ({ status: 201, data });
export const noContent = () => ({ status: 204 });
export const paged = (page) => ({ status: 200, page });

export function requireUser(ctx) {
  if (!ctx.user) throw err(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return ctx.user;
}

export function findOr404(rows, id, what = 'Resource') {
  const row = rows.find((r) => r.id === id);
  if (!row) throw err(404, 'NOT_FOUND', `${what} not found.`);
  return row;
}

export const activeRoles = (db, userId, clubId) =>
  db.roles.filter((r) => r.userId === userId && r.clubId === clubId && !r.revokedAt).map((r) => r.role);

export const hasRole = (db, userId, clubId, roles) => activeRoles(db, userId, clubId).some((r) => roles.includes(r));
export const isOrganizer = (db, userId, eventId) => db.organizers.some((o) => o.userId === userId && o.eventId === eventId);
export const isStaff = (db, userId, eventId) => db.staff.some((o) => o.userId === userId && o.eventId === eventId);

export function isTeam(db, userId, clubId) {
  if (activeRoles(db, userId, clubId).length) return true;
  const clubEvents = new Set(db.events.filter((e) => e.clubId === clubId).map((e) => e.id));
  return db.organizers.some((o) => o.userId === userId && clubEvents.has(o.eventId));
}

/** Club-scoped check: 404 when the user has nothing to do with the club (no enumeration), 403 otherwise. */
export function requireClubRole(ctx, clubId, roles) {
  const user = requireUser(ctx);
  findOr404(ctx.db.clubs, clubId, 'Club');
  if (roles === 'TEAM' ? isTeam(ctx.db, user.id, clubId) : hasRole(ctx.db, user.id, clubId, roles)) return user;
  if (isTeam(ctx.db, user.id, clubId)) throw err(403, 'FORBIDDEN', 'Your role in this club does not allow this action.');
  throw err(404, 'NOT_FOUND', 'Not found.');
}

export const userName = (db, id) => db.users.find((u) => u.id === id)?.fullName || null;
export const clubOf = (db, id) => db.clubs.find((c) => c.id === id);

export function capabilities(db, user) {
  return {
    verifiedStudent: isVerified(db, user.id),
    memberships: db.memberships
      .filter((m) => m.userId === user.id)
      .map((m) => ({ clubId: m.clubId, membershipId: m.id, effectiveStatus: effectiveStatus(m), expiresOn: m.expiresOn })),
    clubRoles: db.roles.filter((r) => r.userId === user.id && !r.revokedAt).map((r) => ({ clubId: r.clubId, role: r.role })),
    organizerOf: db.organizers.filter((o) => o.userId === user.id).map((o) => o.eventId),
    staffOf: db.staff.filter((o) => o.userId === user.id).map((o) => o.eventId),
  };
}

export function userView(u) {
  return { id: u.id, email: u.email, fullName: u.fullName, phoneE164: u.phoneE164 };
}

export function eventView(db, ev) {
  const club = clubOf(db, ev.clubId);
  return {
    ...ev,
    clubName: club?.name,
    clubSlug: club?.slug,
    salesStatus: salesStatus(ev),
    remainingSeats: ev.capacity - ev.seatsReserved,
    earlyBirdRemaining: ev.earlyBirdQuantity == null ? null : ev.earlyBirdQuantity - ev.earlyBirdReserved,
    ticketsSold: db.tickets.filter((t) => t.eventId === ev.id && t.status !== 'CANCELLED').length,
    organizers: db.organizers.filter((o) => o.eventId === ev.id).map((o) => ({ userId: o.userId, fullName: userName(db, o.userId) })),
  };
}
