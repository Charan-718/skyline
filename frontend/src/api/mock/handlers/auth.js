import { err, matchesQ, nowIso, salesStatus, uid } from '../domain';
import { DEMO_PASSWORD } from '../seed';
import { audit } from '../ops';
import { capabilities, clubOf, created, findOr404, noContent, ok, requireClubRole, requireUser, userView } from './shared';

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mePayload(db, user) {
  return { user: userView(user), capabilities: capabilities(db, user) };
}

export const routes = [
  ['POST', '/auth/register', ({ db, body, setSession }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const fields = {};
    if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';
    if (!body.fullName || body.fullName.trim().length < 2) fields.fullName = 'Enter your full name.';
    if (body.phoneE164 && !PHONE_RE.test(body.phoneE164)) fields.phoneE164 = 'Use international format, e.g. +919876543210.';
    if (Object.keys(fields).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields });
    if (!body.password || body.password.length < 8 || body.password.toLowerCase() === email) throw err(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters and different from your email.', { fields: { password: 'At least 8 characters, not your email.' } });
    if (db.users.some((u) => u.email === email)) throw err(409, 'EMAIL_TAKEN', 'An account with this email already exists.', { fields: { email: 'Already registered. Sign in instead.' } });
    const user = { id: uid('usr'), email, fullName: body.fullName.trim(), phoneE164: body.phoneE164 || null, isActive: true, createdAt: nowIso(), password: body.password };
    db.users.push(user);
    setSession(user.id);
    return created(userView(user));
  }],
  ['POST', '/auth/login', ({ db, body, setSession }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = db.users.find((u) => u.email === email);
    if (!user || (body.password !== DEMO_PASSWORD && body.password !== user.password)) {
      throw err(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    setSession(user.id);
    return ok(mePayload(db, user));
  }],
  ['POST', '/auth/logout', ({ setSession }) => {
    setSession(null);
    return noContent();
  }],
  ['GET', '/auth/me', (ctx) => ok(mePayload(ctx.db, requireUser(ctx)))],
  ['PATCH', '/me', (ctx) => {
    const user = requireUser(ctx);
    const { fullName, phoneE164 } = ctx.body;
    const fields = {};
    if (fullName !== undefined && (fullName.trim().length < 2 || fullName.length > 100)) fields.fullName = 'Name must be 2–100 characters.';
    if (phoneE164 && !PHONE_RE.test(phoneE164)) fields.phoneE164 = 'Use international format, e.g. +919876543210.';
    if (Object.keys(fields).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields });
    if (fullName !== undefined) user.fullName = fullName.trim();
    if (phoneE164 !== undefined) user.phoneE164 = phoneE164 || null;
    return ok(userView(user));
  }],
  ['GET', '/me/college-verification', (ctx) => {
    const user = requireUser(ctx);
    const v = ctx.db.verifications.filter((x) => x.userId === user.id && x.outcome !== 'UNAVAILABLE' && !x.supersededAt).sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : -1))[0];
    return ok({ status: v ? v.outcome : 'NONE', checkedAt: v?.checkedAt || null });
  }],
  ['POST', '/me/college-verification', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const sid = String(body.studentIdentifier || '').trim();
    const name = String(body.fullName || '').trim();
    if (!sid || !name) throw err(400, 'VALIDATION_FAILED', 'Enter your student ID and full name.', { fields: { studentIdentifier: !sid ? 'Required' : undefined, fullName: !name ? 'Required' : undefined } });
    const recent = db.verifications.filter((v) => v.userId === user.id && new Date(v.checkedAt).getTime() > Date.now() - 3600000);
    if (recent.length >= 5) throw err(429, 'VERIFICATION_RATE_LIMITED', 'Too many attempts. Try again in an hour.');
    if (sid.toUpperCase() === 'MOCK-UNAVAILABLE') {
      db.verifications.push({ id: uid('ver'), userId: user.id, outcome: 'UNAVAILABLE', adapter: 'mock', checkedAt: nowIso() });
      throw err(503, 'VERIFICATION_UNAVAILABLE', 'The college verification service is unavailable right now. Your account still works, so try again later.');
    }
    const fixture = db.studentFixtures.find((f) => f.studentIdentifier === sid && f.fullName.toLowerCase() === name.toLowerCase());
    if (fixture?.linkedUserId && fixture.linkedUserId !== user.id) throw err(409, 'STUDENT_ID_ALREADY_LINKED', 'This student ID is already linked to another account.');
    db.verifications.filter((v) => v.userId === user.id && !v.supersededAt && v.outcome !== 'UNAVAILABLE').forEach((v) => {
      v.supersededAt = nowIso();
    });
    const outcome = fixture ? 'VERIFIED' : 'NOT_VERIFIED';
    if (fixture) fixture.linkedUserId = user.id;
    const row = { id: uid('ver'), userId: user.id, outcome, adapter: 'mock', checkedAt: nowIso(), supersededAt: null };
    db.verifications.push(row);
    audit(db, user.id, 'COLLEGE_VERIFICATION', 'user', user.id, { outcome });
    return ok({ outcome, checkedAt: row.checkedAt });
  }],

  /* ── Clubs & roles ── */
  ['GET', '/clubs', ({ db, query }) => ok(db.clubs.filter((c) => c.isActive && matchesQ(query.q, c.name, c.description)).map((c) => ({
    id: c.id, slug: c.slug, name: c.name, description: c.description,
    memberCount: db.memberships.filter((m) => m.clubId === c.id && m.status === 'ACTIVE').length,
    upcomingEvents: db.events.filter((e) => e.clubId === c.id && e.status === 'PUBLISHED').length,
  })))],
  ['GET', '/clubs/:clubId', ({ db, params }) => {
    const c = db.clubs.find((x) => x.id === params.clubId || x.slug === params.clubId);
    if (!c) throw err(404, 'NOT_FOUND', 'Club not found.');
    return ok({ ...c, upcomingEvents: db.events.filter((e) => e.clubId === c.id && e.status === 'PUBLISHED' && salesStatus(e) !== 'CLOSED').length, memberCount: db.memberships.filter((m) => m.clubId === c.id && m.status === 'ACTIVE').length });
  }],
  ['GET', '/clubs/:clubId/roles', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { db } = ctx;
    return ok(db.roles.filter((r) => r.clubId === ctx.params.clubId && !r.revokedAt).map((r) => {
      const u = db.users.find((x) => x.id === r.userId);
      return { ...r, fullName: u?.fullName, email: u?.email, assignedByName: db.users.find((x) => x.id === r.assignedBy)?.fullName };
    }));
  }],
  ['POST', '/clubs/:clubId/roles', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { db, body, params } = ctx;
    if (!['CLUB_HEAD', 'TREASURER', 'VOLUNTEER'].includes(body.role)) throw err(400, 'VALIDATION_FAILED', 'Choose a role.', { fields: { role: 'Choose a role.' } });
    const target = db.users.find((u) => u.email === String(body.userEmail || '').trim().toLowerCase());
    if (!target) throw err(422, 'USER_NOT_FOUND', 'No registered user has that email. Ask them to sign up first.', { fields: { userEmail: 'No account with this email.' } });
    if (db.roles.some((r) => r.clubId === params.clubId && r.userId === target.id && r.role === body.role && !r.revokedAt)) throw err(409, 'ROLE_ALREADY_ASSIGNED', `${target.fullName} already has this role.`);
    const row = { id: uid('role'), clubId: params.clubId, userId: target.id, role: body.role, assignedBy: actor.id, assignedAt: nowIso(), revokedAt: null };
    db.roles.push(row);
    audit(db, actor.id, 'CLUB_ROLE_ASSIGNED', 'club', params.clubId, { userId: target.id, role: body.role });
    return created({ ...row, fullName: target.fullName, email: target.email });
  }],
  ['DELETE', '/clubs/:clubId/roles/:assignmentId', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { db, params } = ctx;
    const row = findOr404(db.roles.filter((r) => r.clubId === params.clubId && !r.revokedAt), params.assignmentId, 'Role assignment');
    if (row.role === 'CLUB_HEAD' && db.roles.filter((r) => r.clubId === params.clubId && r.role === 'CLUB_HEAD' && !r.revokedAt).length === 1) {
      throw err(422, 'LAST_CLUB_HEAD', 'A club must always have at least one club head. Assign another club head first.');
    }
    row.revokedAt = nowIso();
    row.revokedBy = actor.id;
    audit(db, actor.id, 'CLUB_ROLE_REVOKED', 'club', params.clubId, { userId: row.userId, role: row.role });
    return noContent();
  }],
  ['GET', '/dev/college-mock', ({ db }) => ok(db.studentFixtures.map((f) => ({ studentIdentifier: f.studentIdentifier, fullName: f.fullName, linked: !!f.linkedUserId })).concat([{ studentIdentifier: 'MOCK-UNAVAILABLE', fullName: '(any)', linked: false }]))],
  ['GET', '/dev/outbox', ({ db, query }) => ok(db.deliveries.filter((d) => !query.channel || d.channel === query.channel).slice(-100).reverse().map((d) => ({ ...d, recipientName: db.users.find((u) => u.id === d.userId)?.fullName, clubName: clubOf(db, db.announcements.find((a) => a.id === d.announcementId)?.clubId)?.name })))],
  ['GET', '/health', () => ok({ status: 'ok', db: 'ok', mode: 'demo' })],
];
