import { z } from 'zod';
import { toCamelCase } from '../../shared/caseMap.js';

export function createClubRepository({ db }) {
  return {
    db,
    async listPublic({ q, limit, offset }, trx = db) {
      let query = trx('clubs').where({ is_active: true }).orderBy('name');
      if (q) query = query.andWhereILike('name', `%${q}%`);
      const rows = await query.limit(limit).offset(offset);
      return rows.map(toCamelCase);
    },

    async findById(id, trx = db) {
      const row = await trx('clubs').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async findBySlug(slug, trx = db) {
      const row = await trx('clubs').where({ slug }).first();
      return row ? toCamelCase(row) : null;
    },

    async findByRef(ref, trx = db) {
      const key = String(ref);
      if (z.string().uuid().safeParse(key).success) {
        const byId = await this.findById(key, trx);
        if (byId) return byId;
      }
      return this.findBySlug(key.toLowerCase(), trx);
    },

    async createClub(row, trx) {
      const [c] = await trx('clubs').insert(row).returning('*');
      return toCamelCase(c);
    },

    async listRoles(clubId, trx = db) {
      const rows = await trx('club_role_assignments as cra')
        .join('users as u', 'u.id', 'cra.user_id')
        .where({ 'cra.club_id': clubId })
        .whereNull('cra.revoked_at')
        .select('cra.*', 'u.email', 'u.full_name');
      return rows.map((r) => ({
        ...toCamelCase(r),
        userEmail: r.email,
        userFullName: r.full_name,
      }));
    },

    async findAssignment(id, trx = db) {
      const row = await trx('club_role_assignments').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async assignRole(row, trx) {
      const [a] = await trx('club_role_assignments').insert(row).returning('*');
      return toCamelCase(a);
    },

    async revokeRole(assignmentId, revokedBy, trx) {
      const [a] = await trx('club_role_assignments')
        .where({ id: assignmentId })
        .whereNull('revoked_at')
        .update({ revoked_at: trx.fn.now(), revoked_by: revokedBy })
        .returning('*');
      return a ? toCamelCase(a) : null;
    },

    async countActiveClubHeads(clubId, trx) {
      const r = await trx('club_role_assignments')
        .where({ club_id: clubId, role: 'CLUB_HEAD' })
        .whereNull('revoked_at')
        .count('* as c')
        .first();
      return Number(r.c);
    },

    async allocateMemberNumber(clubId, trx) {
      const [row] = await trx('clubs')
        .where({ id: clubId })
        .update({ next_member_seq: trx.raw('next_member_seq + 1') })
        .returning(['member_number_prefix', 'next_member_seq']);
      const seq = Number(row.next_member_seq) - 1;
      const prefix = row.member_number_prefix;
      return `${prefix}-${String(seq).padStart(6, '0')}`;
    },
  };
}
