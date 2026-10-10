// Demo-backend domain helpers. These mirror backend rules from LLD §2 so the demo behaves like
// the real API. The UI never imports this file — it only renders what the API returns.

export class MockError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const err = (status, code, message, details) => new MockError(status, code, message, details);

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
export function code(len) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

let counter = 0;
export function uid(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const nowIso = () => new Date().toISOString();
const DAY = 86400000;
export const addDaysIso = (iso, days) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
export const daysFromNow = (d, hour = 10) => {
  const t = new Date(Date.now() + d * DAY);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

// IST calendar date (YYYY-MM-DD)
export function todayIST(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 3600000);
  return ist.toISOString().slice(0, 10);
}
export function addDaysDate(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonthsDate(ymd, months) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const discount = (p, bps) => Math.floor((p * bps + 5000) / 10000);

export function paginate(rows, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  return { data: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length };
}

export function matchesQ(q, ...fields) {
  if (!q) return true;
  const needle = String(q).toLowerCase();
  return fields.some((f) => f && String(f).toLowerCase().includes(needle));
}

/* ───────── Memberships ───────── */
export function effectiveStatus(m) {
  if (m.status === 'ACTIVE' && m.expiresOn && m.expiresOn < todayIST()) return 'EXPIRED';
  return m.status;
}

export function activeBenefits(db, userId, clubId) {
  const m = db.memberships.find((x) => x.userId === userId && x.clubId === clubId);
  if (!m || effectiveStatus(m) !== 'ACTIVE') return null;
  const today = todayIST();
  const term = db.terms
    .filter((t) => t.membershipId === m.id && t.status === 'PAID' && t.startsOn <= today && t.endsOn >= today)
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0];
  if (!term) return null;
  return {
    membershipId: m.id,
    termId: term.id,
    planName: term.planName,
    eventDiscountBps: term.eventDiscountBps,
    merchDiscountBps: term.merchDiscountBps,
    earlyBirdAccess: term.earlyBirdAccess,
  };
}

export function isVerified(db, userId) {
  const v = db.verifications
    .filter((x) => x.userId === userId && x.outcome !== 'UNAVAILABLE' && !x.supersededAt)
    .sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : -1))[0];
  return v?.outcome === 'VERIFIED';
}

/* ───────── Events & pricing (PricingPolicy, BEST_OF) ───────── */
export function salesStatus(ev, { earlyAccess = false } = {}, now = new Date()) {
  if (ev.status !== 'PUBLISHED') return 'CLOSED';
  const t = now.toISOString();
  if (t >= ev.registrationClosesAt || t >= ev.startsAt) return 'CLOSED';
  if (ev.seatsReserved >= ev.capacity) return 'SOLD_OUT';
  if (t >= ev.registrationOpensAt) return 'OPEN';
  if (ev.earlyAccessOpensAt && t >= ev.earlyAccessOpensAt) return earlyAccess ? 'OPEN' : 'EARLY_ACCESS';
  return 'NOT_OPEN';
}

export function quoteTicket(db, ev, userId) {
  const benefits = userId ? activeBenefits(db, userId, ev.clubId) : null;
  const isMember = !!benefits;
  const status = salesStatus(ev, { earlyAccess: isMember && benefits.earlyBirdAccess });
  const base = { buyerType: isMember ? 'MEMBER' : 'NON_MEMBER', salesStatus: status, pricingMode: 'BEST_OF' };
  const reasonMap = { NOT_OPEN: 'REGISTRATION_NOT_OPEN', EARLY_ACCESS: 'REGISTRATION_NOT_OPEN', CLOSED: 'REGISTRATION_CLOSED', SOLD_OUT: 'SOLD_OUT' };
  if (!isMember && ev.nonMemberPricePaise == null) {
    return { ...base, eligible: false, reason: 'MEMBERS_ONLY_EVENT', listPricePaise: null, discountPaise: 0, finalPricePaise: null };
  }
  const listBase = isMember ? ev.memberPricePaise : ev.nonMemberPricePaise;
  const memDisc = isMember && ev.memberDiscountEligible ? discount(listBase, benefits.eventDiscountBps) : 0;
  let quote = { priceTier: isMember ? 'MEMBER_REGULAR' : 'NON_MEMBER_REGULAR', listPricePaise: listBase, discountPaise: memDisc, finalPricePaise: listBase - memDisc, usesEarlyBird: false };
  const ebPrice = isMember ? ev.earlyBirdMemberPricePaise : ev.earlyBirdNonMemberPricePaise;
  const ebRemaining = ev.earlyBirdQuantity == null ? Infinity : ev.earlyBirdQuantity - ev.earlyBirdReserved;
  if (ebPrice != null && ev.earlyBirdEndsAt && nowIso() <= ev.earlyBirdEndsAt && ebRemaining > 0 && ebPrice <= quote.finalPricePaise) {
    quote = { priceTier: isMember ? 'MEMBER_EARLY_BIRD' : 'NON_MEMBER_EARLY_BIRD', listPricePaise: ebPrice, discountPaise: 0, finalPricePaise: ebPrice, usesEarlyBird: true };
  }
  if (quote.finalPricePaise === 0) quote.priceTier = 'FREE';
  const eligible = status === 'OPEN';
  return { ...base, ...quote, eligible, reason: eligible ? undefined : reasonMap[status], membershipTermId: benefits?.termId };
}

export function quoteMerchItem(db, product, userId) {
  const benefits = userId ? activeBenefits(db, userId, product.clubId) : null;
  if (!benefits && !product.availableToNonMembers) return { eligible: false, reason: 'MEMBERS_ONLY_PRODUCT' };
  const list = product.pricePaise;
  const memDisc = benefits && product.memberDiscountEligible ? discount(list, benefits.merchDiscountBps) : 0;
  let result = { eligible: true, listPricePaise: list, discountPaise: memDisc, finalPricePaise: list - memDisc, priceRule: memDisc ? 'MEMBER_DISCOUNT' : 'LIST' };
  const t = nowIso();
  if (product.offerPricePaise != null && product.offerStartsAt <= t && t <= product.offerEndsAt && product.offerPricePaise <= result.finalPricePaise) {
    result = { eligible: true, listPricePaise: list, discountPaise: list - product.offerPricePaise, finalPricePaise: product.offerPricePaise, priceRule: 'OFFER' };
  }
  return result;
}

/* ───────── Fundraisers (LLD §2.9) ───────── */
export function fundraiserProgress(db, f) {
  const tasks = db.tasks.filter((t) => t.fundraiserId === f.id);
  const active = tasks.filter((t) => t.status !== 'CANCELLED');
  const t = nowIso();
  const isOverdue = (x) => (x.status === 'TODO' || x.status === 'IN_PROGRESS') && x.deadline < t;
  const progressPct = active.length ? Math.round(active.reduce((s, x) => s + x.progressPercent, 0) / active.length) : 0;
  const start = new Date(f.startsOn).getTime();
  const end = new Date(f.targetDate).getTime();
  const timeElapsedPct = Math.max(0, Math.min(100, Math.round(((Date.now() - start) / Math.max(1, end - start)) * 100)));
  const overdue = tasks.filter(isOverdue).length;
  let health;
  if (f.status === 'COMPLETED' || f.status === 'CANCELLED') health = f.status;
  else if (!active.length) health = 'NO_TASKS';
  else if (overdue > 0 || (todayIST() > f.targetDate && progressPct < 100)) health = 'OFF_TRACK';
  else if (progressPct < timeElapsedPct - 20) health = 'AT_RISK';
  else health = 'ON_TRACK';
  const income = db.ledger.filter((l) => l.fundraiserId === f.id && l.direction === 'IN').reduce((s, l) => s + l.amountPaise, 0);
  const expensesPaid = db.ledger.filter((l) => l.fundraiserId === f.id && l.direction === 'OUT').reduce((s, l) => s + l.amountPaise, 0);
  return {
    progressPct,
    timeElapsedPct,
    health,
    counts: {
      todo: tasks.filter((x) => x.status === 'TODO').length,
      inProgress: tasks.filter((x) => x.status === 'IN_PROGRESS').length,
      done: tasks.filter((x) => x.status === 'DONE').length,
      cancelled: tasks.filter((x) => x.status === 'CANCELLED').length,
      overdue,
    },
    money: { incomePaise: income, expensesPaidPaise: expensesPaid, netPaise: income - expensesPaid, goalPct: f.goalAmountPaise ? Math.round((income / f.goalAmountPaise) * 100) : null },
    isOverdue,
  };
}

/* ───────── Finance (LLD §2.10) ───────── */
export function financeSummary(db, clubId, { from, to } = {}) {
  const ledger = db.ledger.filter((l) => l.clubId === clubId);
  const inPeriod = ledger.filter((l) => (!from || l.occurredAt.slice(0, 10) >= from) && (!to || l.occurredAt.slice(0, 10) <= to));
  const sum = (rows) => rows.reduce((s, r) => s + r.amountPaise, 0);
  const incomeByCategory = {};
  inPeriod.filter((l) => l.direction === 'IN').forEach((l) => {
    incomeByCategory[l.category] = (incomeByCategory[l.category] || 0) + l.amountPaise;
  });
  const availableBalancePaise = sum(ledger.filter((l) => l.direction === 'IN')) - sum(ledger.filter((l) => l.direction === 'OUT'));
  const expenses = db.expenses.filter((e) => e.clubId === clubId);
  const approvedUnpaidTotalPaise = sum(expenses.filter((e) => e.status === 'APPROVED'));
  const pendingReviewTotalPaise = sum(expenses.filter((e) => e.status === 'SUBMITTED'));
  const today = todayIST();
  const budget = db.budgets.find((b) => b.clubId === clubId && b.periodStart <= today && b.periodEnd >= today);
  let activeBudget = null;
  if (budget) {
    const spentPaise = sum(ledger.filter((l) => l.direction === 'OUT' && l.occurredAt.slice(0, 10) >= budget.periodStart && l.occurredAt.slice(0, 10) <= budget.periodEnd));
    const committedPaise = sum(expenses.filter((e) => e.status === 'APPROVED' && e.incurredOn >= budget.periodStart && e.incurredOn <= budget.periodEnd));
    activeBudget = { id: budget.id, name: budget.name, amountPaise: budget.amountPaise, spentPaise, committedPaise, remainingPaise: budget.amountPaise - spentPaise, remainingAfterCommittedPaise: budget.amountPaise - spentPaise - committedPaise };
  }
  const months = {};
  inPeriod.forEach((l) => {
    const m = l.occurredAt.slice(0, 7);
    months[m] = months[m] || { month: m, inPaise: 0, outPaise: 0 };
    months[m][l.direction === 'IN' ? 'inPaise' : 'outPaise'] += l.amountPaise;
  });
  return {
    currency: 'INR',
    period: { from: from || null, to: to || null },
    totalIncomePaise: sum(inPeriod.filter((l) => l.direction === 'IN')),
    incomeByCategory,
    totalPaidExpensesPaise: sum(inPeriod.filter((l) => l.direction === 'OUT')),
    availableBalancePaise,
    approvedUnpaidTotalPaise,
    pendingReviewTotalPaise,
    projectedBalancePaise: availableBalancePaise - approvedUnpaidTotalPaise,
    activeBudget,
    monthly: Object.values(months).sort((a, b) => (a.month < b.month ? -1 : 1)),
  };
}
