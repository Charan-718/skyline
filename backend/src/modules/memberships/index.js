// TODO(group1): Group 1 owns this module. Group 2 only needs the payment handler export,
// registered in container.js.
export { createMembershipPaymentHandlers } from './handlers/membershipPaymentHandler.js';

/**
 * TODO(group1): interface stub (LLD §2.3). getActiveBenefits(userId, clubId, date) ->
 *   { membershipId, termId, planName, eventDiscountBps, merchDiscountBps, earlyBirdAccess } | null
 * Snapshot of the PAID term covering `date` of an effective ACTIVE membership.
 */
export async function getActiveBenefits(_userId, _clubId, _date) {
  throw new Error('TODO(group1): memberships.getActiveBenefits is not implemented yet');
}
