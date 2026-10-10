import { todayIST, addDaysToDate, computeTermEndsOn } from '../../../shared/clock.js';
import { effectiveMembershipStatus } from './membershipStateMachine.js';

export function computeTermStart(membership) {
  const today = todayIST();
  const effective = effectiveMembershipStatus(membership);
  if (effective === 'ACTIVE' && membership.expiresOn) {
    return addDaysToDate(membership.expiresOn, 1);
  }
  return today;
}

export function computeTermDates(membership, durationMonths) {
  const startsOn = computeTermStart(membership);
  const endsOn = computeTermEndsOn(startsOn, durationMonths);
  return { startsOn, endsOn };
}
