import { todayIST } from '../../shared/clock.js';
import { effectiveMembershipStatus } from './domain/membershipStateMachine.js';

export function daysToExpiry(expiresOn) {
  if (!expiresOn) return null;
  const ms = new Date(expiresOn).getTime() - new Date(`${todayIST()}T12:00:00+05:30`).getTime();
  return Math.trunc(ms / 86400000);
}

export async function membershipSummary(db, membership, { clubRepository, membershipRepository }) {
  const club = await clubRepository.findById(membership.clubId);
  const plan = membership.currentPlanId
    ? await membershipRepository.findPlan(membership.currentPlanId)
    : null;
  const eff = membership.effectiveStatus ?? effectiveMembershipStatus(membership);
  return {
    id: membership.id,
    clubId: membership.clubId,
    clubName: club?.name ?? null,
    clubSlug: club?.slug ?? null,
    status: membership.status,
    effectiveStatus: eff,
    memberNumber: membership.memberNumber ?? null,
    planName: plan?.name ?? null,
    planId: membership.currentPlanId ?? null,
    startedOn: membership.startedOn ?? null,
    expiresOn: membership.expiresOn ?? null,
    daysToExpiry: daysToExpiry(membership.expiresOn),
    autopayEnabled: membership.autopayEnabled ?? false,
  };
}
