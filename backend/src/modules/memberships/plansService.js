import { AppError, assertFound } from '../../shared/errors.js';

export function createPlansService({ membershipRepository, authz, authService }) {
  return {
    async listPlans(actorUserId, clubId, query) {
      const isHead = await authz.isClubHead(actorUserId, clubId);
      if (!isHead) {
        const verified = await authService.isVerifiedStudent(actorUserId);
        if (!verified) throw new AppError('NOT_VERIFIED', 403, 'Verified student required');
      }
      const includeArchived = isHead && query.includeArchived === 'true';
      return membershipRepository.listPlansForClub(clubId, includeArchived);
    },

    async createPlan(actorUserId, clubId, dto) {
      await authz.requireClubHead(actorUserId, clubId);
      try {
        const [plan] = await membershipRepository.db('membership_plans')
          .insert({
            club_id: clubId,
            name: dto.name,
            description: dto.description ?? '',
            benefits_text: dto.benefitsText ?? '',
            fee_paise: dto.feePaise,
            duration_months: dto.durationMonths,
            event_discount_bps: dto.eventDiscountBps ?? 0,
            merch_discount_bps: dto.merchDiscountBps ?? 0,
            early_bird_access: dto.earlyBirdAccess ?? false,
            status: 'ACTIVE',
            created_by: actorUserId,
          })
          .returning('*');
        return plan;
      } catch (err) {
        if (err.code === '23505') throw new AppError('PLAN_NAME_TAKEN', 409, 'Plan name taken');
        throw err;
      }
    },

    async getPlan(planId) {
      const plan = await membershipRepository.findPlan(planId);
      assertFound(plan, 'Plan not found');
      return plan;
    },
  };
}
