import { toCamelCase } from '../../shared/caseMap.js';

export function createAuthRepository({ db }) {
  return {
    db,
    async findUserByEmail(email, trx = db) {
      const row = await trx('users').whereRaw('lower(email) = ?', [email.toLowerCase()]).first();
      return row ? toCamelCase(row) : null;
    },

    async findUserById(id, trx = db) {
      const row = await trx('users').where({ id }).first();
      return row ? toCamelCase(row) : null;
    },

    async insertUser(row, trx = db) {
      const [u] = await trx('users')
        .insert({ ...row, email: row.email.toLowerCase() })
        .returning(['id', 'email', 'full_name', 'phone_e164', 'is_active', 'created_at', 'updated_at']);
      return toCamelCase(u);
    },

    async findUserWithPasswordByEmail(email, trx = db) {
      const row = await trx('users').whereRaw('lower(email) = ?', [email.toLowerCase()]).first();
      return row ? { ...toCamelCase(row), passwordHash: row.password_hash } : null;
    },

    async updateUser(id, patch, trx = db) {
      const snake = {};
      if (patch.fullName != null) snake.full_name = patch.fullName;
      if (patch.phoneE164 !== undefined) snake.phone_e164 = patch.phoneE164;
      snake.updated_at = trx.fn.now();
      const [u] = await trx('users').where({ id }).update(snake).returning('*');
      return u ? toCamelCase(u) : null;
    },

    async insertVerification(row, trx) {
      const [v] = await trx('college_verifications').insert(row).returning('*');
      return toCamelCase(v);
    },

    async supersedeCurrentVerification(userId, trx) {
      await trx('college_verifications')
        .where({ user_id: userId })
        .whereNull('superseded_at')
        .whereNot({ outcome: 'UNAVAILABLE' })
        .update({ superseded_at: trx.fn.now() });
    },

    async getCurrentVerification(userId, trx = db) {
      const row = await trx('college_verifications')
        .where({ user_id: userId })
        .whereNull('superseded_at')
        .whereNot({ outcome: 'UNAVAILABLE' })
        .orderBy('checked_at', 'desc')
        .first();
      return row ? toCamelCase(row) : null;
    },

    async countVerificationsSince(userId, since, trx = db) {
      const r = await trx('college_verifications')
        .where({ user_id: userId })
        .andWhere('checked_at', '>=', since)
        .count('* as c')
        .first();
      return Number(r.c);
    },
  };
}
