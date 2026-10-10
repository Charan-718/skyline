import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { validate } from '../../shared/middleware/validate.js';
import { todayIST } from '../../shared/clock.js';
import { effectiveMembershipStatus } from '../memberships/domain/membershipStateMachine.js';
import { toCamelCase } from '../../shared/caseMap.js';
import { AppError } from '../../shared/errors.js';
import { clubRefSchema } from '../clubs/schemas.js';

const clubIdParams = z.object({ clubId: clubRefSchema });

function requireHeadOrTreasurer(authz) {
  return async (req, _res, next) => {
    try {
      const clubId = req.params.clubId;
      const head = await authz.isClubHead(req.userId, clubId);
      const tr = await authz.isTreasurer(req.userId, clubId);
      if (!head && !tr) return next(new AppError('FORBIDDEN', 403, 'Forbidden'));
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function createClubReportsRoutes({ db, authz, eventReportService }) {
  const router = Router();
  const headOrTreasurer = requireHeadOrTreasurer(authz);

  router.get(
    '/clubs/:clubId/reports/events',
    requireAuth,
    validate({ params: clubIdParams }),
    headOrTreasurer,
    async (req, res, next) => {
      try {
        const events = await db('events')
          .where({ club_id: req.params.clubId })
          .whereNot({ status: 'DRAFT' })
          .orderBy('starts_at', 'desc');
        const club = await db('clubs').where({ id: req.params.clubId }).first();
        const data = await Promise.all(
          events.map(async (ev) => {
            const report = (await eventReportService.getEventReport(ev.id)) ?? {};
            return {
              eventId: ev.id,
              memberVsNonMember: { MEMBER: 0, NON_MEMBER: 0 },
              expensesPaidPaise: 0,
              eventNetPaise: 0,
              grossRecordedRevenuePaise: 0,
              ticketsSold: 0,
              checkedIn: 0,
              ...report,
              title: ev.title,
              status: ev.status,
              startsAt: ev.starts_at,
              clubName: club?.name,
            };
          }),
        );
        res.json({ data });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    '/clubs/:clubId/reports/memberships',
    requireAuth,
    validate({ params: clubIdParams }),
    headOrTreasurer,
    async (req, res, next) => {
      try {
        const clubId = req.params.clubId;
        const head = await authz.isClubHead(req.userId, clubId);
        const tr = await authz.isTreasurer(req.userId, clubId);
        const ms = await db('memberships').where({ club_id: clubId });
        const normalized = ms.map((m) => {
          const c = toCamelCase(m);
          c.effectiveStatus = effectiveMembershipStatus(c);
          return c;
        });
        const active = normalized.filter((m) => m.effectiveStatus === 'ACTIVE');
        const plans = await db('membership_plans').where({ club_id: clubId });
        const byPlan = plans.map((p) => ({
          planId: p.id,
          planName: p.name,
          status: p.status,
          activeMembers: active.filter((m) => m.currentPlanId === p.id).length,
        })).filter((p) => p.activeMembers || p.status === 'ACTIVE');
        const terms = await db('membership_terms').where({ club_id: clubId, status: 'PAID' });
        const monthly = {};
        terms.forEach((t) => {
          const k = (t.paid_at ?? t.created_at).toISOString().slice(0, 7);
          monthly[k] = monthly[k] || { month: k, joins: 0, renewals: 0 };
          monthly[k][t.kind === 'JOIN' ? 'joins' : 'renewals'] += 1;
        });
        const in7 = addDays(todayIST(), 7);
        const dues = await db('financial_transactions')
          .where({ club_id: clubId })
          .whereIn('category', ['MEMBERSHIP_DUES', 'MEMBERSHIP_RENEWAL'])
          .sum('amount_paise as s')
          .first();
        const attempts = await db('renewal_attempts')
          .whereIn('membership_id', ms.map((m) => m.id))
          .select('status');
        const renewalAttempts = attempts.reduce(
          (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
          {},
        );
        res.json({
          data: {
            totalMembers: ms.length,
            activeMembers: active.length,
            expiredMembers: normalized.filter((m) => m.effectiveStatus === 'EXPIRED').length,
            pendingPayment: normalized.filter((m) => m.status === 'PENDING_PAYMENT').length,
            expiringIn7Days: active.filter((m) => m.expiresOn <= in7).length,
            autopayEnabled: active.filter((m) => m.autopayEnabled).length,
            duesCollectedPaise: Number(dues?.s ?? 0),
            byPlan,
            monthly: Object.values(monthly).sort((a, b) => (a.month < b.month ? -1 : 1)),
            renewalAttempts,
            viewerTeam: head || tr,
          },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    '/clubs/:clubId/reports/merchandise',
    requireAuth,
    validate({ params: clubIdParams }),
    headOrTreasurer,
    async (req, res, next) => {
      try {
        const clubId = req.params.clubId;
        const orders = await db('orders').where({ club_id: clubId });
        const soldIds = new Set(
          orders.filter((o) => ['CONFIRMED', 'PICKED_UP'].includes(o.status)).map((o) => o.id),
        );
        const items = soldIds.size
          ? await db('order_items').whereIn('order_id', [...soldIds])
          : [];
        const units = {};
        items.forEach((i) => {
          const k = `${i.product_name}|${i.size_label}`;
          units[k] = units[k] || { productName: i.product_name, sizeLabel: i.size_label, units: 0, revenuePaise: 0 };
          units[k].units += i.quantity;
          units[k].revenuePaise += Number(i.line_total_paise);
        });
        const byStatus = orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {});
        const revenue = await db('financial_transactions')
          .where({ club_id: clubId, category: 'MERCH_SALE' })
          .sum('amount_paise as s')
          .first();
        const openAlerts = await db('low_stock_alerts')
          .where({ club_id: clubId, status: 'OPEN' })
          .count('* as c')
          .first();
        res.json({
          data: {
            unitsSold: Object.values(units).sort((a, b) => b.units - a.units),
            revenuePaise: Number(revenue?.s ?? 0),
            ordersByStatus: byStatus,
            openAlerts: Number(openAlerts?.c ?? 0),
          },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
