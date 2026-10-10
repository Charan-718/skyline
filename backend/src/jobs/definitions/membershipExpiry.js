import { todayIST } from '../../shared/clock.js';

export function createMembershipExpiryJob({ db }) {
  return {
    name: 'membership-expiry',
    async execute(_trx) {
      const today = todayIST();
      const updated = await db('memberships')
        .where({ status: 'ACTIVE' })
        .andWhere('expires_on', '<', today)
        .update({ status: 'EXPIRED', updated_at: db.fn.now() });
      return { expiredCount: updated };
    },
  };
}
