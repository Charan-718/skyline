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

    async updatePlan(actorUserId, planId, dto) {
      const plan = await membershipRepository.findPlan(planId);
      assertFound(plan, 'Plan not found');
      await authz.requireClubHead(actorUserId, plan.clubId);
      if (plan.status === 'ARCHIVED') {
        throw new AppError('CONFLICT_STATE', 409, 'Archived plan cannot be edited');
      }
      const patch = {};
      if (dto.name != null) patch.name = dto.name;
      if (dto.description != null) patch.description = dto.description;
      if (dto.benefitsText != null) patch.benefits_text = dto.benefitsText;
      if (dto.feePaise != null) patch.fee_paise = dto.feePaise;
      if (dto.durationMonths != null) patch.duration_months = dto.durationMonths;
      if (dto.eventDiscountBps != null) patch.event_discount_bps = dto.eventDiscountBps;
      if (dto.merchDiscountBps != null) patch.merch_discount_bps = dto.merchDiscountBps;
      if (dto.earlyBirdAccess != null) patch.early_bird_access = dto.earlyBirdAccess;
      const [updated] = await membershipRepository.db('membership_plans')
        .where({ id: planId })
        .update({ ...patch, updated_at: membershipRepository.db.fn.now() })
        .returning('*');
      return updated;
    },

    async archivePlan(actorUserId, planId) {
      const plan = await membershipRepository.findPlan(planId);
      assertFound(plan, 'Plan not found');
      await authz.requireClubHead(actorUserId, plan.clubId);
      const [updated] = await membershipRepository.db('membership_plans')
        .where({ id: planId })
        .update({ status: 'ARCHIVED', updated_at: membershipRepository.db.fn.now() })
        .returning('*');
      return updated;
    },
  };
}
