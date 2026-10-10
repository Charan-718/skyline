import { addDaysDate, effectiveStatus, err, financeSummary, nowIso, paginate, todayIST, uid } from '../domain';
import { audit, postLedger } from '../ops';
import { clubOf, created, findOr404, hasRole, isTeam, ok, paged, requireClubRole, requireUser, userName } from './shared';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;

function expenseView(db, e) {
  const file = db.files.find((f) => f.id === e.receiptFileId);
  return {
    ...e,
    submittedByName: userName(db, e.submittedBy),
    payeeName: userName(db, e.payeeUserId),
    decidedByName: userName(db, e.decidedBy),
    paidByName: userName(db, e.paidBy),
    eventTitle: e.eventId ? db.events.find((x) => x.id === e.eventId)?.title : null,
    fundraiserName: e.fundraiserId ? db.fundraisers.find((x) => x.id === e.fundraiserId)?.name : null,
    receipt: file ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes } : null,
  };
}

/** Separation of duties (LLD §2.10, OD-06). */
function deciderAllowed(db, userId, e, subjectUserId) {
  const treasurer = hasRole(db, userId, e.clubId, ['TREASURER']);
  const head = hasRole(db, userId, e.clubId, ['CLUB_HEAD']);
  const subjectIsTreasurer = hasRole(db, subjectUserId, e.clubId, ['TREASURER']);
  if (userId === subjectUserId) return false;
  if (subjectIsTreasurer) return head;
  return treasurer;
}

export const routes = [
  ['GET', '/clubs/:clubId/budgets', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db } = ctx;
    return ok(db.budgets.filter((b) => b.clubId === ctx.params.clubId).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1)).map((b) => {
      const spentPaise = db.ledger.filter((l) => l.clubId === b.clubId && l.direction === 'OUT' && l.occurredAt.slice(0, 10) >= b.periodStart && l.occurredAt.slice(0, 10) <= b.periodEnd).reduce((s, l) => s + l.amountPaise, 0);
      const committedPaise = db.expenses.filter((e) => e.clubId === b.clubId && e.status === 'APPROVED' && e.incurredOn >= b.periodStart && e.incurredOn <= b.periodEnd).reduce((s, e) => s + e.amountPaise, 0);
      const today = todayIST();
      return { ...b, spentPaise, committedPaise, remainingPaise: b.amountPaise - spentPaise, remainingAfterCommittedPaise: b.amountPaise - spentPaise - committedPaise, isCurrent: b.periodStart <= today && b.periodEnd >= today };
    }));
  }],
  ['POST', '/clubs/:clubId/budgets', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['TREASURER']);
    const { db, body } = ctx;
    const f = {};
    if (!body.name || !body.name.trim()) f.name = 'Enter a name.';
    if (!body.periodStart) f.periodStart = 'Required.';
    if (!body.periodEnd) f.periodEnd = 'Required.';
    if (body.periodStart && body.periodEnd && body.periodEnd < body.periodStart) f.periodEnd = 'Must be after the start.';
    if (!Number.isInteger(body.amountPaise) || body.amountPaise <= 0) f.amountPaise = 'Amount must be more than zero.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    const overlap = db.budgets.find((b) => b.clubId === ctx.params.clubId && b.periodStart <= body.periodEnd && b.periodEnd >= body.periodStart);
    if (overlap) throw err(409, 'BUDGET_PERIOD_OVERLAP', `This period overlaps “${overlap.name}”.`, { fields: { periodStart: 'Overlaps an existing budget.' } });
    const b = { id: uid('bud'), clubId: ctx.params.clubId, name: body.name.trim(), periodStart: body.periodStart, periodEnd: body.periodEnd, amountPaise: body.amountPaise, notes: body.notes || null, createdBy: actor.id };
    db.budgets.push(b);
    audit(db, actor.id, 'BUDGET_CREATED', 'budget', b.id);
    return created(b);
  }],
  ['PATCH', '/budgets/:budgetId', (ctx) => {
    const b = findOr404(ctx.db.budgets, ctx.params.budgetId, 'Budget');
    const actor = requireClubRole(ctx, b.clubId, ['TREASURER']);
    if (ctx.body.amountPaise !== undefined && (!Number.isInteger(ctx.body.amountPaise) || ctx.body.amountPaise <= 0)) throw err(400, 'VALIDATION_FAILED', 'Amount must be more than zero.', { fields: { amountPaise: '> 0' } });
    ['name', 'amountPaise', 'notes'].forEach((k) => {
      if (ctx.body[k] !== undefined) b[k] = ctx.body[k];
    });
    audit(ctx.db, actor.id, 'BUDGET_UPDATED', 'budget', b.id);
    return ok(b);
  }],
  ['POST', '/clubs/:clubId/expenses', (ctx) => {
    const user = requireUser(ctx);
    const { db, body, params } = ctx;
    findOr404(db.clubs, params.clubId, 'Club');
    const kind = body.kind || 'REIMBURSEMENT';
    if (kind === 'DIRECT') requireClubRole(ctx, params.clubId, ['TREASURER']);
    else requireClubRole(ctx, params.clubId, 'TEAM');
    const amountPaise = parseInt(body.amountPaise, 10);
    const f = {};
    if (!body.title || !String(body.title).trim()) f.title = 'Enter what the expense was for.';
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) f.amountPaise = 'Amount must be more than zero.';
    if (!body.incurredOn) f.incurredOn = 'Enter the date of the expense.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    const file = body.receipt;
    if (!file || typeof file === 'string') throw err(400, 'RECEIPT_REQUIRED', 'Attach a receipt (JPEG, PNG or PDF).', { fields: { receipt: 'Receipt is required.' } });
    if (!ALLOWED_TYPES.includes(file.type)) throw err(415, 'UNSUPPORTED_FILE_TYPE', 'Receipts must be JPEG, PNG or PDF.', { fields: { receipt: 'Use JPEG, PNG or PDF.' } });
    if (file.size > MAX_BYTES) throw err(413, 'FILE_TOO_LARGE', 'Receipts must be 5 MB or smaller.', { fields: { receipt: 'Max 5 MB.' } });
    if (body.eventId && !db.events.some((e) => e.id === body.eventId && e.clubId === params.clubId)) throw err(422, 'EVENT_NOT_IN_CLUB', 'That event is not in this club.');
    const stored = { id: uid('file'), clubId: params.clubId, uploadedBy: user.id, purpose: 'RECEIPT', originalName: file.name, mimeType: file.type, sizeBytes: file.size };
    db.files.push(stored);
    const e = { id: uid('exp'), clubId: params.clubId, kind, title: String(body.title).trim(), description: body.description || '', amountPaise, incurredOn: body.incurredOn, eventId: body.eventId || null, fundraiserId: body.fundraiserId || null, receiptFileId: stored.id, submittedBy: user.id, payeeUserId: user.id, status: 'SUBMITTED', decidedBy: null, decidedAt: null, decisionNote: null, paidBy: null, paidAt: null, payoutReference: null, createdAt: nowIso() };
    if (kind === 'DIRECT') {
      e.status = 'PAID';
      e.paidBy = user.id;
      e.paidAt = nowIso();
      e.payoutReference = body.payoutReference || null;
      postLedger(db, { clubId: e.clubId, direction: 'OUT', category: 'DIRECT_EXPENSE', amountPaise, sourceType: 'EXPENSE', sourceId: e.id, eventId: e.eventId, fundraiserId: e.fundraiserId, recordedBy: user.id, reference: e.payoutReference, description: e.title, evidenceFileId: stored.id, occurredAt: e.paidAt });
    }
    db.expenses.push(e);
    audit(db, user.id, kind === 'DIRECT' ? 'DIRECT_EXPENSE_RECORDED' : 'REIMBURSEMENT_SUBMITTED', 'expense', e.id);
    return created(expenseView(db, e));
  }],
  ['GET', '/clubs/:clubId/expenses', (ctx) => {
    const user = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db, query } = ctx;
    const rows = db.expenses
      .filter((e) => e.clubId === ctx.params.clubId && (!query.status || e.status === query.status) && (!query.kind || e.kind === query.kind) && (!query.eventId || e.eventId === query.eventId) && (!query.fundraiserId || e.fundraiserId === query.fundraiserId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((e) => ({ ...expenseView(db, e), viewerCanDecide: e.status === 'SUBMITTED' && deciderAllowed(db, user.id, e, e.submittedBy), viewerCanPay: e.status === 'APPROVED' && deciderAllowed(db, user.id, e, e.payeeUserId) }));
    return paged(paginate(rows, query));
  }],
  ['GET', '/me/expenses', (ctx) => {
    const user = requireUser(ctx);
    return ok(ctx.db.expenses.filter((e) => e.submittedBy === user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((e) => ({ ...expenseView(ctx.db, e), clubName: clubOf(ctx.db, e.clubId)?.name })));
  }],
  ['GET', '/expenses/:id', (ctx) => {
    const user = requireUser(ctx);
    const e = findOr404(ctx.db.expenses, ctx.params.id, 'Expense');
    if (e.submittedBy !== user.id && !hasRole(ctx.db, user.id, e.clubId, ['CLUB_HEAD', 'TREASURER'])) throw err(404, 'NOT_FOUND', 'Expense not found.');
    return ok(expenseView(ctx.db, e));
  }],
  ...['approve', 'reject'].map((action) => ['POST', `/expenses/:id/${action}`, (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const e = findOr404(db.expenses, ctx.params.id, 'Expense');
    if (!hasRole(db, user.id, e.clubId, ['CLUB_HEAD', 'TREASURER'])) throw err(404, 'NOT_FOUND', 'Expense not found.');
    if (!deciderAllowed(db, user.id, e, e.submittedBy)) throw err(403, 'SELF_APPROVAL_FORBIDDEN', e.submittedBy === user.id ? 'You cannot decide on your own claim.' : 'Claims from the treasurer are decided by the club head; others by the treasurer.');
    if (e.status !== 'SUBMITTED') throw err(409, 'CONFLICT_STATE', `This claim is already ${e.status.toLowerCase()}.`, { currentStatus: e.status });
    if (action === 'reject' && (!body.note || !String(body.note).trim())) throw err(400, 'VALIDATION_FAILED', 'Explain why the claim is rejected.', { fields: { note: 'Required when rejecting.' } });
    e.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    e.decidedBy = user.id;
    e.decidedAt = nowIso();
    e.decisionNote = body.note || null;
    audit(db, user.id, action === 'approve' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED', 'expense', e.id);
    return ok(expenseView(db, e));
  }]),
  ['POST', '/expenses/:id/mark-paid', (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const e = findOr404(db.expenses, ctx.params.id, 'Expense');
    if (!hasRole(db, user.id, e.clubId, ['CLUB_HEAD', 'TREASURER'])) throw err(404, 'NOT_FOUND', 'Expense not found.');
    if (!deciderAllowed(db, user.id, e, e.payeeUserId)) throw err(403, 'SELF_PAYOUT_FORBIDDEN', 'You cannot record a payout to yourself.');
    if (e.status !== 'APPROVED') throw err(409, 'CONFLICT_STATE', 'Only approved claims can be marked paid.', { currentStatus: e.status });
    if (!body.payoutReference || !String(body.payoutReference).trim()) throw err(400, 'VALIDATION_FAILED', 'Enter the payout reference (UPI/bank).', { fields: { payoutReference: 'Required.' } });
    e.status = 'PAID';
    e.paidBy = user.id;
    e.paidAt = body.paidOn ? new Date(`${body.paidOn}T12:00:00`).toISOString() : nowIso();
    e.payoutReference = body.payoutReference;
    postLedger(db, { clubId: e.clubId, direction: 'OUT', category: 'REIMBURSEMENT_PAYOUT', amountPaise: e.amountPaise, sourceType: 'EXPENSE', sourceId: e.id, eventId: e.eventId, fundraiserId: e.fundraiserId, recordedBy: user.id, approvedBy: e.decidedBy, reference: e.payoutReference, description: e.title, evidenceFileId: e.receiptFileId, occurredAt: e.paidAt });
    audit(db, user.id, 'EXPENSE_PAID', 'expense', e.id);
    return ok(expenseView(db, e));
  }],
  ['POST', '/clubs/:clubId/income-entries', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['TREASURER']);
    const { db, body } = ctx;
    const f = {};
    if (!body.fundraiserId) f.fundraiserId = 'Choose a fundraiser.';
    if (!Number.isInteger(body.amountPaise) || body.amountPaise <= 0) f.amountPaise = 'Amount must be more than zero.';
    if (!body.receivedOn) f.receivedOn = 'Required.';
    if (!body.description || !String(body.description).trim()) f.description = 'Describe the income.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    if (!db.fundraisers.some((x) => x.id === body.fundraiserId && x.clubId === ctx.params.clubId)) throw err(422, 'FUNDRAISER_NOT_IN_CLUB', 'That fundraiser is not in this club.');
    const row = postLedger(db, { clubId: ctx.params.clubId, direction: 'IN', category: 'FUNDRAISER_INCOME', amountPaise: body.amountPaise, sourceType: 'INCOME_ENTRY', sourceId: uid('inc'), fundraiserId: body.fundraiserId, recordedBy: actor.id, reference: body.reference || null, description: body.description, occurredAt: new Date(`${body.receivedOn}T12:00:00`).toISOString() });
    audit(db, actor.id, 'INCOME_RECORDED', 'ledger', row.id);
    return created(row);
  }],
  ['GET', '/clubs/:clubId/transactions', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db, query } = ctx;
    const rows = db.ledger
      .filter((l) => l.clubId === ctx.params.clubId && (!query.direction || l.direction === query.direction) && (!query.category || l.category === query.category) && (!query.from || l.occurredAt.slice(0, 10) >= query.from) && (!query.to || l.occurredAt.slice(0, 10) <= query.to))
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .map((l) => ({ ...l, recordedByName: l.recordedBy ? userName(db, l.recordedBy) : 'System', approvedByName: userName(db, l.approvedBy), payerName: userName(db, l.payerUserId), eventTitle: l.eventId ? db.events.find((e) => e.id === l.eventId)?.title : null, fundraiserName: l.fundraiserId ? db.fundraisers.find((x) => x.id === l.fundraiserId)?.name : null }));
    return paged(paginate(rows, query));
  }],
  ['GET', '/clubs/:clubId/finance/summary', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, 'TEAM');
    return ok(financeSummary(ctx.db, ctx.params.clubId, ctx.query));
  }],
  ['GET', '/clubs/:clubId/finance/reconciliation', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db } = ctx;
    const clubId = ctx.params.clubId;
    const cat = { MEMBERSHIP_JOIN: 'MEMBERSHIP_DUES', MEMBERSHIP_RENEWAL: 'MEMBERSHIP_RENEWAL', EVENT_TICKET: 'TICKET_SALE', MERCH_ORDER: 'MERCH_SALE' };
    const succeeded = db.payments.filter((p) => p.clubId === clubId && p.status === 'SUCCEEDED');
    const ledger = db.ledger.filter((l) => l.clubId === clubId);
    const checks = Object.entries(cat).map(([purpose, category]) => {
      const paid = succeeded.filter((p) => p.purpose === purpose).reduce((s, p) => s + p.amountPaise, 0);
      const posted = ledger.filter((l) => l.sourceType === 'PAYMENT' && l.category === category).reduce((s, l) => s + l.amountPaise, 0);
      return { name: `${purpose} payments = ledger ${category}`, expectedPaise: paid, actualPaise: posted, ok: paid === posted };
    });
    const missing = succeeded.filter((p) => !ledger.some((l) => l.sourceType === 'PAYMENT' && l.sourceId === p.id));
    checks.push({ name: 'Succeeded payments without a ledger row', expected: 0, actual: missing.length, ok: missing.length === 0 });
    const paidExp = db.expenses.filter((e) => e.clubId === clubId && e.status === 'PAID').reduce((s, e) => s + e.amountPaise, 0);
    const out = ledger.filter((l) => l.direction === 'OUT').reduce((s, l) => s + l.amountPaise, 0);
    checks.push({ name: 'Paid expenses = ledger OUT', expectedPaise: paidExp, actualPaise: out, ok: paidExp === out });
    return ok({ ok: checks.every((c) => c.ok), checkedAt: nowIso(), checks, mismatches: missing.map((p) => ({ paymentId: p.id, reference: p.reference })) });
  }],
  ['GET', '/clubs/:clubId/reports/finance', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const s = financeSummary(ctx.db, ctx.params.clubId);
    const outByCategory = {};
    ctx.db.ledger.filter((l) => l.clubId === ctx.params.clubId && l.direction === 'OUT').forEach((l) => {
      outByCategory[l.category] = (outByCategory[l.category] || 0) + l.amountPaise;
    });
    return ok({ ...s, outByCategory });
  }],
  ['GET', '/clubs/:clubId/reports/memberships', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db } = ctx;
    const clubId = ctx.params.clubId;
    const ms = db.memberships.filter((m) => m.clubId === clubId);
    const active = ms.filter((m) => effectiveStatus(m) === 'ACTIVE');
    const byPlan = db.plans.filter((p) => p.clubId === clubId).map((p) => ({ planId: p.id, planName: p.name, status: p.status, activeMembers: active.filter((m) => m.currentPlanId === p.id).length })).filter((p) => p.activeMembers || p.status === 'ACTIVE');
    const termIds = new Set(db.terms.filter((t) => ms.some((m) => m.id === t.membershipId) && t.status === 'PAID').map((t) => t));
    const monthly = {};
    [...termIds].forEach((t) => {
      const k = (t.paidAt || t.createdAt).slice(0, 7);
      monthly[k] = monthly[k] || { month: k, joins: 0, renewals: 0 };
      monthly[k][t.kind === 'JOIN' ? 'joins' : 'renewals'] += 1;
    });
    const today = todayIST();
    const in7 = addDaysDate(today, 7);
    return ok({
      totalMembers: ms.length,
      activeMembers: active.length,
      expiredMembers: ms.filter((m) => effectiveStatus(m) === 'EXPIRED').length,
      pendingPayment: ms.filter((m) => m.status === 'PENDING_PAYMENT').length,
      expiringIn7Days: active.filter((m) => m.expiresOn <= in7).length,
      autopayEnabled: active.filter((m) => m.autopayEnabled).length,
      duesCollectedPaise: db.ledger.filter((l) => l.clubId === clubId && ['MEMBERSHIP_DUES', 'MEMBERSHIP_RENEWAL'].includes(l.category)).reduce((s, l) => s + l.amountPaise, 0),
      byPlan,
      monthly: Object.values(monthly).sort((a, b) => (a.month < b.month ? -1 : 1)),
      renewalAttempts: db.renewalAttempts.filter((r) => ms.some((m) => m.id === r.membershipId)).reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}),
      viewerTeam: isTeam(db, ctx.user.id, clubId),
    });
  }],
];
