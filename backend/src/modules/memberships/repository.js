import { toCamelCase } from '../../shared/caseMap.js';
import { todayIST } from '../../shared/clock.js';
import { effectiveMembershipStatus } from './domain/membershipStateMachine.js';

export function createMembershipRepository({ db }) {
  return {
    db,

    async findPlan(planId, trx = db) {
      const row = await trx('membership_plans').where({ id: planId }).first();
      return row ? toCamelCase(row) : null;
    },

    async listPlansForClub(clubId, includeArchived, trx = db) {
      let q = trx('membership_plans').where({ club_id: clubId });
      if (!includeArchived) q = q.andWhere({ status: 'ACTIVE' });
      const rows = await q.orderBy('name');
      return rows.map(toCamelCase);
    },

    async findMembershipForUserClub(userId, clubId, trx) {
      const row = await trx('memberships').where({ user_id: userId, club_id: clubId }).forUpdate().first();
      return row ? toCamelCase(row) : null;
    },

    async insertMembership(row, trx) {
      const [m] = await trx('memberships').insert(row).returning('*');
      return toCamelCase(m);
    },

    async updateMembership(id, patch, trx = db) {
      const [m] = await trx('memberships').where({ id }).update(patch).returning('*');
      return m ? toCamelCase(m) : null;
    },

    async insertTerm(row, trx) {
      const [t] = await trx('membership_terms').insert(row).returning('*');
      return toCamelCase(t);
    },

    async findTerm(id, trx = db) {
      const row = await trx('membership_terms').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async findTermForUpdate(id, trx) {
      const row = await trx('membership_terms').where({ id }).forUpdate().first();
      return row ? toCamelCase(row) : null;
    },

    async findPendingPaymentForMembership(membershipId, trx = db) {
      const row = await trx('membership_terms')
        .where({ membership_id: membershipId, status: 'PENDING_PAYMENT' })
        .first();
      return row ? toCamelCase(row) : null;
    },

    async listMyMemberships(userId, trx = db) {
      const rows = await trx('memberships').where({ user_id: userId });
      return rows.map((r) => {
        const m = toCamelCase(r);
        m.effectiveStatus = effectiveMembershipStatus(m);
        return m;
      });
    },

    async findMembershipById(id, trx = db) {
      const row = await trx('memberships').where({ id }).first();
      if (!row) return null;
      const m = toCamelCase(row);
      m.effectiveStatus = effectiveMembershipStatus(m);
      return m;
    },

    async findByQrToken(token, trx = db) {
      const row = await trx('memberships').where({ qr_token: token }).first();
      return row ? toCamelCase(row) : null;
    },

    async getPaidTermCoveringDate(membershipId, dateStr, trx = db) {
      const row = await trx('membership_terms')
        .where({ membership_id: membershipId, status: 'PAID' })
        .andWhere('starts_on', '<=', dateStr)
        .andWhere('ends_on', '>=', dateStr)
        .orderBy('ends_on', 'desc')
        .first();
      return row ? toCamelCase(row) : null;
    },

    async listActiveMemberUserIds(clubId, dateStr, trx = db) {
      const rows = await trx('memberships')
        .where({ club_id: clubId, status: 'ACTIVE' })
        .andWhere('expires_on', '>=', dateStr)
        .select('user_id');
      return rows.map((r) => r.user_id);
    },

    async listClubMemberships(clubId, filters, trx = db) {
      let q = trx('memberships as m')
        .join('users as u', 'u.id', 'm.user_id')
        .where('m.club_id', clubId);
      if (filters.planId) q = q.andWhere('m.current_plan_id', filters.planId);
      if (filters.status) {
        if (filters.status === 'ACTIVE') {
          q = q.andWhere('m.status', 'ACTIVE').andWhere('m.expires_on', '>=', todayIST());
        } else if (filters.status === 'EXPIRED') {
          q = q.andWhere((b) =>
            b.where('m.status', 'EXPIRED').orWhere((b2) =>
              b2.where('m.status', 'ACTIVE').andWhere('m.expires_on', '<', todayIST()),
            ),
          );
        } else {
          q = q.andWhere('m.status', filters.status);
        }
      }
      if (filters.q) {
        const like = `%${filters.q}%`;
        q = q.andWhere((b) =>
          b.whereILike('u.full_name', like).orWhereILike('u.email', like).orWhereILike('m.member_number', like),
        );
      }
      if (filters.expiringWithin) {
        const until = addDays(todayIST(), Number(filters.expiringWithin));
        q = q.andWhere('m.status', 'ACTIVE').andWhereBetween('m.expires_on', [todayIST(), until]);
      }
      const countRow = await q.clone().count('* as c').first();
      const total = Number(countRow.c);
      const rows = await q
        .orderBy('u.full_name')
        .offset(filters.offset ?? 0)
        .limit(filters.limit ?? 20)
        .select('m.*', 'u.full_name', 'u.email');
      return { rows, total };
    },
  };
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
