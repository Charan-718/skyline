import { addDaysDate, code, effectiveStatus, err, isVerified, matchesQ, nowIso, paginate, todayIST, uid } from '../domain';
import { audit, settlePayment, startMembershipTerm } from '../ops';
import { clubOf, created, findOr404, hasRole, isTeam, ok, paged, requireClubRole, requireUser, userName } from './shared';

const PLAN_FIELDS = ['name', 'description', 'benefitsText', 'feePaise', 'durationMonths', 'eventDiscountBps', 'merchDiscountBps', 'earlyBirdAccess'];

function validatePlan(body, partial) {
  const fields = {};
  if (!partial || body.name !== undefined) if (!body.name || !String(body.name).trim()) fields.name = 'Enter a plan name.';
  if (!partial || body.feePaise !== undefined) if (!Number.isInteger(body.feePaise) || body.feePaise < 0) fields.feePaise = 'Fee must be zero or more.';
  if (!partial || body.durationMonths !== undefined) if (!Number.isInteger(body.durationMonths) || body.durationMonths < 1 || body.durationMonths > 24) fields.durationMonths = 'Duration must be 1–24 months.';
  ['eventDiscountBps', 'merchDiscountBps'].forEach((k) => {
    if (body[k] !== undefined && (!Number.isInteger(body[k]) || body[k] < 0 || body[k] > 10000)) fields[k] = 'Discount must be 0–100%.';
  });
  if (Object.keys(fields).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields });
}

function membershipSummary(db, m) {
  const club = clubOf(db, m.clubId);
  const plan = db.plans.find((p) => p.id === m.currentPlanId);
  return {
    id: m.id, clubId: m.clubId, clubName: club?.name, clubSlug: club?.slug, status: m.status, effectiveStatus: effectiveStatus(m),
    memberNumber: m.memberNumber, planName: plan?.name || null, planId: m.currentPlanId, startedOn: m.startedOn, expiresOn: m.expiresOn,
    daysToExpiry: m.expiresOn ? Math.round((new Date(m.expiresOn) - new Date(todayIST())) / 86400000) : null,
    autopayEnabled: m.autopayEnabled,
  };
}

function digitalId(db, m) {
  if (!m.memberNumber) throw err(422, 'MEMBERSHIP_NEVER_ACTIVATED', 'Your membership has not been activated yet.');
  const user = db.users.find((u) => u.id === m.userId);
  const plan = db.plans.find((p) => p.id === m.currentPlanId);
  return { memberName: user.fullName, clubName: clubOf(db, m.clubId)?.name, memberNumber: m.memberNumber, planName: plan?.name, effectiveStatus: effectiveStatus(m), expiresOn: m.expiresOn, qrPayload: `SOMS1:M:${m.qrToken}` };
}

function ownMembership(ctx) {
  const user = requireUser(ctx);
  const m = ctx.db.memberships.find((x) => x.id === ctx.params.membershipId && x.userId === user.id);
  if (!m) throw err(404, 'NOT_FOUND', 'Membership not found.');
  return { user, m };
}

function checkPlan(db, planId, clubId, expectedFeePaise) {
  const plan = db.plans.find((p) => p.id === planId && p.clubId === clubId);
  if (!plan || plan.status !== 'ACTIVE') throw err(422, 'PLAN_NOT_AVAILABLE', 'This plan is no longer available.');
  if (expectedFeePaise !== undefined && expectedFeePaise !== plan.feePaise) throw err(409, 'PRICE_CHANGED', 'The plan fee has changed. Review the new price and confirm.', { feePaise: plan.feePaise });
  return plan;
}

export const routes = [
  ['GET', '/clubs/:clubId/plans', (ctx) => {
    const user = requireUser(ctx);
    const { db, params, query } = ctx;
    findOr404(db.clubs, params.clubId, 'Club');
    const head = hasRole(db, user.id, params.clubId, ['CLUB_HEAD']);
    if (!head && !isVerified(db, user.id)) throw err(403, 'NOT_VERIFIED', 'Membership plans are available to verified college students. Verify your student ID from your profile.');
    return ok(db.plans.filter((p) => p.clubId === params.clubId && (p.status === 'ACTIVE' || (head && query.includeArchived === 'true'))).map((p) => ({
      ...p, activeMembers: db.memberships.filter((m) => m.currentPlanId === p.id && effectiveStatus(m) === 'ACTIVE').length,
    })));
  }],
  ['POST', '/clubs/:clubId/plans', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { db, body, params } = ctx;
    validatePlan(body);
    if (db.plans.some((p) => p.clubId === params.clubId && p.name.toLowerCase() === body.name.trim().toLowerCase() && p.status === 'ACTIVE')) throw err(409, 'PLAN_NAME_TAKEN', 'A plan with this name already exists.', { fields: { name: 'Name already used.' } });
    const plan = { id: uid('plan'), clubId: params.clubId, status: 'ACTIVE', createdAt: nowIso(), earlyBirdAccess: false, eventDiscountBps: 0, merchDiscountBps: 0, ...Object.fromEntries(PLAN_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])) };
    plan.name = plan.name.trim();
    db.plans.push(plan);
    audit(db, actor.id, 'PLAN_CREATED', 'plan', plan.id);
    return created(plan);
  }],
  ['PATCH', '/plans/:planId', (ctx) => {
    const plan = findOr404(ctx.db.plans, ctx.params.planId, 'Plan');
    const actor = requireClubRole(ctx, plan.clubId, ['CLUB_HEAD']);
    if (plan.status === 'ARCHIVED') throw err(409, 'CONFLICT_STATE', 'Archived plans cannot be edited.', { currentStatus: 'ARCHIVED' });
    validatePlan(ctx.body, true);
    PLAN_FIELDS.forEach((k) => {
      if (ctx.body[k] !== undefined) plan[k] = ctx.body[k];
    });
    audit(ctx.db, actor.id, 'PLAN_UPDATED', 'plan', plan.id);
    return ok(plan);
  }],
  ['POST', '/plans/:planId/archive', (ctx) => {
    const plan = findOr404(ctx.db.plans, ctx.params.planId, 'Plan');
    const actor = requireClubRole(ctx, plan.clubId, ['CLUB_HEAD']);
    plan.status = 'ARCHIVED';
    audit(ctx.db, actor.id, 'PLAN_ARCHIVED', 'plan', plan.id);
    return ok(plan);
  }],
  ['POST', '/clubs/:clubId/memberships', (ctx) => {
    const user = requireUser(ctx);
    const { db, params, body } = ctx;
    const club = findOr404(db.clubs, params.clubId, 'Club');
    if (!isVerified(db, user.id)) throw err(403, 'NOT_VERIFIED', 'Verify your college student ID before joining.');
    const plan = checkPlan(db, body.planId, club.id, body.expectedFeePaise);
    const { membership, term, payment } = startMembershipTerm(db, { userId: user.id, club, plan, kind: 'JOIN' });
    return created({ membership: { id: membership.id, status: membership.status }, term, payment });
  }],
  ['GET', '/me/memberships', (ctx) => {
    const user = requireUser(ctx);
    return ok(ctx.db.memberships.filter((m) => m.userId === user.id).map((m) => membershipSummary(ctx.db, m)));
  }],
  ['GET', '/me/memberships/:membershipId', (ctx) => {
    const { m } = ownMembership(ctx);
    const { db } = ctx;
    const terms = db.terms.filter((t) => t.membershipId === m.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const termIds = new Set(terms.map((t) => t.id));
    const current = terms.find((t) => t.status === 'PAID' && t.startsOn <= todayIST() && t.endsOn >= todayIST());
    return ok({
      ...membershipSummary(db, m),
      benefits: current ? { planName: current.planName, eventDiscountBps: current.eventDiscountBps, merchDiscountBps: current.merchDiscountBps, earlyBirdAccess: current.earlyBirdAccess, benefitsText: current.benefitsText } : null,
      terms,
      payments: db.payments.filter((p) => termIds.has(p.membershipTermId)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      pendingPayment: db.payments.find((p) => termIds.has(p.membershipTermId) && ['INITIATED', 'PENDING'].includes(p.status) && p.method === 'SIMULATED') || null,
      renewalOptions: db.plans.filter((p) => p.clubId === m.clubId && p.status === 'ACTIVE').map((p) => ({ planId: p.id, name: p.name, feePaise: p.feePaise, durationMonths: p.durationMonths })),
      autopay: { enabled: m.autopayEnabled, planId: m.autopayPlanId, amountPaise: m.autopayAmountPaise, nextAttemptOn: m.autopayEnabled ? m.expiresOn : null },
      consents: db.autopayConsents.filter((c) => c.membershipId === m.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      renewalAttempts: db.renewalAttempts.filter((r) => r.membershipId === m.id),
    });
  }],
  ['POST', '/me/memberships/:membershipId/renewals', (ctx) => {
    const { user, m } = ownMembership(ctx);
    const { db, body } = ctx;
    if (!isVerified(db, user.id)) throw err(403, 'NOT_VERIFIED', 'Verify your college student ID before renewing.');
    if (['PENDING_PAYMENT', 'CANCELLED'].includes(m.status)) throw err(409, 'CONFLICT_STATE', 'This membership cannot be renewed in its current state.', { currentStatus: m.status });
    const plan = checkPlan(db, body.planId, m.clubId, body.expectedFeePaise);
    const { term, payment } = startMembershipTerm(db, { userId: user.id, club: clubOf(db, m.clubId), plan, kind: 'RENEWAL' });
    return created({ term, payment });
  }],
  ['PUT', '/me/memberships/:membershipId/autopay', (ctx) => {
    const { user, m } = ownMembership(ctx);
    const { db, body } = ctx;
    if (body.enabled) {
      if (effectiveStatus(m) !== 'ACTIVE') throw err(422, 'MEMBERSHIP_NOT_ACTIVE', 'AutoPay can only be enabled on an active membership.');
      if (!body.acknowledgeSimulated || !body.consentTextVersion) throw err(400, 'ACK_REQUIRED', 'Please confirm that you understand AutoPay is simulated.');
      const plan = checkPlan(db, body.planId, m.clubId);
      m.autopayEnabled = true;
      m.autopayPlanId = plan.id;
      m.autopayAmountPaise = plan.feePaise;
      db.autopayConsents.push({ id: uid('apc'), membershipId: m.id, status: 'ENABLED', planId: plan.id, consentedAmountPaise: plan.feePaise, consentTextVersion: body.consentTextVersion, createdAt: nowIso() });
    } else {
      m.autopayEnabled = false;
      db.autopayConsents.push({ id: uid('apc'), membershipId: m.id, status: 'DISABLED', planId: m.autopayPlanId, consentedAmountPaise: m.autopayAmountPaise, consentTextVersion: null, createdAt: nowIso() });
    }
    audit(db, user.id, 'AUTOPAY_CHANGED', 'membership', m.id, { enabled: !!body.enabled });
    return ok({ enabled: m.autopayEnabled, planId: m.autopayPlanId, amountPaise: m.autopayAmountPaise, nextAttemptOn: m.autopayEnabled ? m.expiresOn : null });
  }],
  ['GET', '/me/memberships/:membershipId/digital-id', (ctx) => ok(digitalId(ctx.db, ownMembership(ctx).m))],
  ['POST', '/me/memberships/:membershipId/digital-id/rotate', (ctx) => {
    const { user, m } = ownMembership(ctx);
    m.qrToken = code(22);
    audit(ctx.db, user.id, 'MEMBERSHIP_QR_ROTATED', 'membership', m.id);
    return ok(digitalId(ctx.db, m));
  }],
  ['POST', '/membership-verifications', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const payload = String(body.qrPayload || '').trim();
    if (!payload.startsWith('SOMS1:M:')) throw err(400, 'INVALID_QR_FORMAT', payload.startsWith('SOMS1:T:') ? 'This is a ticket QR, not a membership card.' : 'This QR code is not a Campus Flow membership card.');
    const m = db.memberships.find((x) => x.qrToken === payload.slice(8));
    const staffOfClub = m && db.staff.some((s) => s.userId === user.id && db.events.find((e) => e.id === s.eventId)?.clubId === m.clubId);
    if (!m || !(isTeam(db, user.id, m.clubId) || staffOfClub)) throw err(404, 'NOT_FOUND', 'Membership not found (unknown card, rotated QR, or another club).');
    audit(db, user.id, 'MEMBERSHIP_VERIFIED', 'membership', m.id);
    const d = digitalId(db, m);
    delete d.qrPayload;
    return ok(d);
  }],
  ['GET', '/clubs/:clubId/memberships', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db, params, query } = ctx;
    const rows = db.memberships
      .filter((m) => m.clubId === params.clubId)
      .map((m) => {
        const u = db.users.find((x) => x.id === m.userId);
        const summary = membershipSummary(db, m);
        return { ...summary, userId: u.id, fullName: u.fullName, email: u.email, verificationStatus: isVerified(db, u.id) ? 'VERIFIED' : 'NOT_VERIFIED' };
      })
      .filter((r) => (!query.status || r.effectiveStatus === query.status) && (!query.planId || r.planId === query.planId) && matchesQ(query.q, r.fullName, r.email, r.memberNumber))
      .filter((r) => !query.expiringWithin || (r.effectiveStatus === 'ACTIVE' && r.expiresOn <= addDaysDate(todayIST(), Number(query.expiringWithin))))
      .sort((a, b) => (a.fullName < b.fullName ? -1 : 1));
    return paged(paginate(rows, query));
  }],

  /* ── Payments (simulated) ── */
  ['GET', '/payments/:paymentId', (ctx) => {
    const user = requireUser(ctx);
    const { db } = ctx;
    const p = db.payments.find((x) => x.id === ctx.params.paymentId && x.userId === user.id);
    if (!p) throw err(404, 'NOT_FOUND', 'Payment not found.');
    return ok({ ...p, target: paymentTarget(db, p) });
  }],
  ['POST', '/payments/:paymentId/simulate', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const p = db.payments.find((x) => x.id === ctx.params.paymentId && x.userId === user.id);
    if (!p) throw err(404, 'NOT_FOUND', 'Payment not found.');
    if (p.method !== 'SIMULATED') throw err(403, 'FORBIDDEN', 'AutoPay payments cannot be settled from checkout.');
    if (!['SUCCEEDED', 'FAILED', 'PENDING'].includes(body.outcome)) throw err(400, 'VALIDATION_FAILED', 'Choose an outcome.');
    if (p.status === 'INITIATED' || p.status === 'PENDING') {
      const holdUntil = paymentTarget(db, p)?.holdExpiresAt;
      if (holdUntil && holdUntil < nowIso()) settlePayment(db, p, 'EXPIRED', { reason: 'HOLD_EXPIRED' });
      else settlePayment(db, p, body.outcome);
    }
    return ok({ ...p, target: paymentTarget(db, p) });
  }],
  ['GET', '/me/payments', (ctx) => {
    const user = requireUser(ctx);
    const rows = ctx.db.payments.filter((p) => p.userId === user.id && (!ctx.query.status || p.status === ctx.query.status)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((p) => ({ ...p, target: paymentTarget(ctx.db, p) }));
    return paged(paginate(rows, ctx.query));
  }],
  ['GET', '/clubs/:clubId/payments', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db, query } = ctx;
    const rows = db.payments.filter((p) => p.clubId === ctx.params.clubId && (!query.status || p.status === query.status) && (!query.purpose || p.purpose === query.purpose)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((p) => ({ ...p, payerName: userName(db, p.userId) }));
    return paged(paginate(rows, query));
  }],
];

export function paymentTarget(db, p) {
  const club = clubOf(db, p.clubId);
  if (p.membershipTermId) {
    const t = db.terms.find((x) => x.id === p.membershipTermId);
    return { kind: 'MEMBERSHIP', title: `${t?.planName} membership, ${club?.name}`, membershipId: t?.membershipId, clubName: club?.name };
  }
  if (p.bookingId) {
    const b = db.bookings.find((x) => x.id === p.bookingId);
    const e = db.events.find((x) => x.id === b?.eventId);
    const ticket = db.tickets.find((t) => t.bookingId === b?.id);
    return { kind: 'EVENT_TICKET', title: `Ticket: ${e?.title}`, eventId: e?.id, bookingId: b?.id, ticketId: ticket?.id, priceTier: b?.priceTier, holdExpiresAt: b?.status === 'PENDING_PAYMENT' ? b.holdExpiresAt : null, clubName: club?.name };
  }
  if (p.orderId) {
    const o = db.orders.find((x) => x.id === p.orderId);
    const items = db.orderItems.filter((i) => i.orderId === o?.id);
    return { kind: 'MERCH_ORDER', title: `Merchandise order, ${club?.name}`, orderId: o?.id, items, holdExpiresAt: o?.status === 'PENDING_PAYMENT' ? o.holdExpiresAt : null, clubName: club?.name };
  }
  return null;
}
