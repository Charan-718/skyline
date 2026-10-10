import { applyBps } from '../shared/money.js';
import { appError } from '../shared/errors.js';
import { todayIST } from '../shared/clock.js';

/**
 * Group 1 implementations of interfaces expected by Group 2 modules (access, finance, merch, fundraisers).
 */
export function createGroup1Bridge({ db, authRepository, authz }) {
  const auth = {
    async getUser(userId, { trx } = {}) {
      const row = await (trx ?? db)('users').where({ id: userId }).first();
      if (!row) return null;
      return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phoneE164: row.phone_e164,
        isActive: row.is_active,
      };
    },
    async getUsersByIds(userIds) {
      const ids = [...new Set(userIds.filter(Boolean))];
      if (!ids.length) return [];
      const rows = await db('users').whereIn('id', ids).select('id', 'full_name');
      return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
    },
  };

  const clubs = {
    async hasClubRole(userId, clubId, roles) {
      const row = await db('club_role_assignments')
        .where({ user_id: userId, club_id: clubId })
        .whereIn('role', roles)
        .whereNull('revoked_at')
        .first();
      return Boolean(row);
    },
    async listRoleHolders(clubId, role, { trx } = {}) {
      const rows = await (trx ?? db)('club_role_assignments')
        .where({ club_id: clubId, role })
        .whereNull('revoked_at')
        .orderBy('assigned_at')
        .select('user_id');
      return rows.map((r) => ({ userId: r.user_id }));
    },
  };

  const events = {
    async getEventClub(eventId) {
      const row = await db('events').where({ id: eventId }).first('club_id');
      return row?.club_id ?? null;
    },
    async isClubEventOrganizer(userId, clubId) {
      const row = await db('event_organizers as o')
        .join('events as e', 'e.id', 'o.event_id')
        .where({ 'o.user_id': userId, 'e.club_id': clubId })
        .first('o.event_id');
      return Boolean(row);
    },
  };

  const memberships = {
    async getActiveBenefits(userId, clubId, date) {
      const row = await db('memberships as m')
        .join('membership_terms as t', 't.membership_id', 'm.id')
        .where({ 'm.user_id': userId, 'm.club_id': clubId, 'm.status': 'ACTIVE', 't.status': 'PAID' })
        .where('m.expires_on', '>=', date)
        .where('t.starts_on', '<=', date)
        .where('t.ends_on', '>=', date)
        .first(
          'm.id as membership_id',
          't.id as term_id',
          't.plan_name',
          't.event_discount_bps',
          't.merch_discount_bps',
          't.early_bird_access',
        );
      if (!row) return null;
      return {
        membershipId: row.membership_id,
        termId: row.term_id,
        planName: row.plan_name,
        eventDiscountBps: row.event_discount_bps,
        merchDiscountBps: row.merch_discount_bps,
        earlyBirdAccess: row.early_bird_access,
      };
    },
  };

  const pricing = {
    async quoteMerchItem(product, benefits, now, { mode = 'BEST_OF' } = {}) {
      if (!benefits && !product.availableToNonMembers) {
        throw appError('MEMBERS_ONLY_PRODUCT');
      }
      let listPricePaise = Number(product.pricePaise);
      let priceRule = 'LIST';
      const offerStart = product.offerStartsAt ? new Date(product.offerStartsAt).getTime() : null;
      const offerEnd = product.offerEndsAt ? new Date(product.offerEndsAt).getTime() : null;
      const t = now.getTime();
      if (product.offerPricePaise != null && offerStart != null && offerEnd != null && t >= offerStart && t <= offerEnd) {
        listPricePaise = Number(product.offerPricePaise);
        priceRule = 'OFFER';
      }
      let discountPaise = 0;
      if (benefits && product.memberDiscountEligible !== false) {
        const memberDisc = applyBps(listPricePaise, benefits.merchDiscountBps ?? 0);
        if (mode === 'STACK' || priceRule === 'LIST') {
          discountPaise = memberDisc;
          if (memberDisc > 0) priceRule = 'MEMBER_DISCOUNT';
        } else if (memberDisc > 0 && mode === 'BEST_OF') {
          discountPaise = memberDisc;
          priceRule = 'MEMBER_DISCOUNT';
        }
      }
      const finalPricePaise = Math.max(0, listPricePaise - discountPaise);
      return { listPricePaise, discountPaise, finalPricePaise, priceRule };
    },
  };

  return Object.freeze({ auth, clubs, events, memberships, pricing, authRepository, authz });
}

/** Injectable clock for Group 2 ({ now, todayIST }). */
export function createAppClock() {
  return {
    now: () => new Date(),
    todayIST,
  };
}

export function toGroup2Config(config) {
  return {
    ...config,
    timezone: config.APP_TIMEZONE,
    uploadDir: config.UPLOAD_DIR,
    maxUploadBytes: config.MAX_UPLOAD_BYTES,
    pricingCombinationMode: config.PRICING_COMBINATION_MODE,
    simAutopayOutcome: config.SIM_AUTOPAY_OUTCOME,
    notifyMode: config.NOTIFY_MODE,
    devNotifyFailChannel: config.DEV_NOTIFY_FAIL_CHANNEL,
    fundraiserAtRiskTolerancePct: config.fundraiserAtRiskTolerancePct ?? 20,
  };
}
