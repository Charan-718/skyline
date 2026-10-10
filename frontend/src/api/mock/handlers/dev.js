// Dev-only job runner (LLD §4.11 `POST /dev/jobs/:jobName/run`) so reminders and AutoPay can be demoed.
import { addDaysDate, effectiveStatus, err, nowIso, todayIST, uid } from '../domain';
import { enqueue, settlePayment, startMembershipTerm } from '../ops';
import { ok, requireUser } from './shared';

const jobs = {
  'membership-expiry': (db) => {
    let expired = 0;
    db.memberships.forEach((m) => {
      if (m.status === 'ACTIVE' && effectiveStatus(m) === 'EXPIRED') {
        m.status = 'EXPIRED';
        expired += 1;
      }
    });
    return { expired };
  },
  'renewal-reminders': (db, { asOf }) => {
    const today = asOf || todayIST();
    const in7 = addDaysDate(today, 7);
    let queued = 0;
    db.memberships.filter((m) => m.status === 'ACTIVE' && m.expiresOn > today && m.expiresOn <= in7).forEach((m) => {
      const term = db.terms.find((t) => t.membershipId === m.id && t.status === 'PAID' && t.endsOn === m.expiresOn);
      const key = `renewal-reminder:${term?.id}:EMAIL`;
      if (!db.deliveries.some((d) => d.dedupeKey === key)) {
        enqueue(db, { userId: m.userId, channel: 'EMAIL', template: 'RENEWAL_REMINDER_7D', payload: { expiresOn: m.expiresOn }, dedupeKey: key });
        queued += 1;
      }
    });
    return { queued, note: 'One reminder email per term; re-running never duplicates.' };
  },
  'autopay-renewals': (db, { asOf, autopayOutcome = 'SUCCEEDED' }) => {
    const day = asOf || todayIST();
    const results = [];
    db.memberships.filter((m) => m.autopayEnabled && m.status === 'ACTIVE' && m.expiresOn === day).forEach((m) => {
      if (db.renewalAttempts.some((r) => r.membershipId === m.id && r.forExpiresOn === day)) return;
      const attempt = { id: uid('rna'), membershipId: m.id, forExpiresOn: day, status: 'PROCESSING', createdAt: nowIso() };
      db.renewalAttempts.push(attempt);
      const plan = db.plans.find((p) => p.id === m.autopayPlanId);
      if (!plan || plan.status !== 'ACTIVE') {
        attempt.status = 'SKIPPED';
        attempt.skipReason = 'PLAN_ARCHIVED';
      } else if (plan.feePaise !== m.autopayAmountPaise) {
        attempt.status = 'SKIPPED';
        attempt.skipReason = 'PRICE_CHANGED';
      } else {
        const club = db.clubs.find((c) => c.id === m.clubId);
        const { term, payment } = startMembershipTerm(db, { userId: m.userId, club, plan, kind: 'RENEWAL', source: 'AUTOPAY' });
        attempt.termId = term.id;
        attempt.paymentId = payment?.id;
        if (payment) settlePayment(db, payment, autopayOutcome);
        attempt.status = payment ? payment.status === 'SUCCEEDED' ? 'SUCCEEDED' : payment.status : 'SUCCEEDED';
      }
      enqueue(db, { userId: m.userId, template: 'AUTOPAY_RESULT', payload: { status: attempt.status }, dedupeKey: `autopay:${attempt.id}` });
      results.push({ membershipId: m.id, status: attempt.status, skipReason: attempt.skipReason });
    });
    return { attempted: results.length, results };
  },
};

export const routes = [
  ['POST', '/dev/jobs/:jobName/run', (ctx) => {
    requireUser(ctx);
    const job = jobs[ctx.params.jobName];
    if (!job) throw err(404, 'NOT_FOUND', 'Unknown job.');
    return ok({ job: ctx.params.jobName, ranAt: nowIso(), ...job(ctx.db, ctx.body || {}) });
  }],
  ['GET', '/dev/autopay-candidates', (ctx) => {
    requireUser(ctx);
    return ok(ctx.db.memberships.filter((m) => m.autopayEnabled && m.status === 'ACTIVE').map((m) => ({ membershipId: m.id, expiresOn: m.expiresOn, memberName: ctx.db.users.find((u) => u.id === m.userId)?.fullName, clubName: ctx.db.clubs.find((c) => c.id === m.clubId)?.name })));
  }],
];
