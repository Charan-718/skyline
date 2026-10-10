import { appError } from '../../src/shared/errors.js';

// Test stand-ins for Group 1 interfaces that are TODO(group1) stubs in src/ (OQ-05, OQ-28,
// OQ-08, OQ-38). They read the Group 1 fixture tables directly. Delete when Group 1 merges.
// `overrides` lets a test replace one function (e.g. events.getEventClub returning another club).

export function createGroup1Fakes(db, overrides = {}) {
  return {
    auth: {
      async getUser(userId, { trx } = {}) {
        const row = await (trx ?? db)('users').where({ id: userId }).first();
        if (!row) return null;
        return { id: row.id, fullName: row.full_name, email: row.email, phoneE164: row.phone_e164, isActive: row.is_active };
      },
      async getUsersByIds(userIds) {
        const ids = [...new Set(userIds.filter(Boolean))];
        if (!ids.length) return [];
        const rows = await db('users').whereIn('id', ids).select('id', 'full_name');
        return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
      },
      ...overrides.auth,
    },
    clubs: {
      async hasClubRole(userId, clubId, roles) {
        const row = await db('club_role_assignments')
          .where({ user_id: userId, club_id: clubId })
          .whereIn('role', roles)
          .whereNull('revoked_at')
          .first();
        return Boolean(row);
      },
      async listRoleHolders(clubId, role, { trx } = {}) {
        const rows = await (trx ?? db)('club_role_assignments').where({ club_id: clubId, role }).whereNull('revoked_at').orderBy('assigned_at').select('user_id');
        return rows.map((r) => ({ userId: r.user_id }));
      },
      ...overrides.clubs,
    },
    memberships: {
      // Reads the fixture: benefits of the PAID term covering `date` of an ACTIVE membership.
      async getActiveBenefits(userId, clubId, date) {
        const row = await db('memberships as m')
          .join('membership_terms as t', 't.membership_id', 'm.id')
          .where({ 'm.user_id': userId, 'm.club_id': clubId, 'm.status': 'ACTIVE', 't.status': 'PAID' })
          .where('m.expires_on', '>=', date)
          .where('t.starts_on', '<=', date)
          .where('t.ends_on', '>=', date)
          .first('m.id as membership_id', 't.id as term_id', 't.plan_name', 't.event_discount_bps', 't.merch_discount_bps', 't.early_bird_access');
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
      ...overrides.memberships,
    },
    pricing: {
      // TEST DOUBLE ONLY — not PricingPolicy (OQ-07: Group 2 implements no pricing). It charges the
      // list price and applies only the members-only gate, so order flows can be exercised.
      // Tests that need other prices override it per test. TC-MER-05 stays skipped.
      async quoteMerchItem(product, benefits) {
        if (!benefits && !product.availableToNonMembers) throw appError('MEMBERS_ONLY_PRODUCT');
        return { listPricePaise: product.pricePaise, discountPaise: 0, finalPricePaise: product.pricePaise, priceRule: 'LIST' };
      },
      ...overrides.pricing,
    },
    events: {
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
      ...overrides.events,
    },
  };
}
