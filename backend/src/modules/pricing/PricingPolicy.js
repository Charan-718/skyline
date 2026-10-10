import { applyBps } from '../../shared/money.js';
import { AppError } from '../../shared/errors.js';

export const PRICE_TIERS = {
  MEMBER_REGULAR: 'MEMBER_REGULAR',
  NON_MEMBER_REGULAR: 'NON_MEMBER_REGULAR',
  MEMBER_EARLY_BIRD: 'MEMBER_EARLY_BIRD',
  NON_MEMBER_EARLY_BIRD: 'NON_MEMBER_EARLY_BIRD',
  FREE: 'FREE',
};

/**
 * @param {import('../../shared/clock.js').now} nowFn
 * @param {'BEST_OF'|'STACK'} combinationMode
 */
export function createPricingPolicy(nowFn, combinationMode = 'BEST_OF') {
  function discount(p, bps) {
    return applyBps(p, bps);
  }

  function salesWindow(event, hasEarlyAccess, now) {
    if (event.status !== 'PUBLISHED') {
      throw new AppError('REGISTRATION_NOT_OPEN', 422, 'Registration is not open');
    }
    const t = now.getTime();
    const regOpen = new Date(event.registrationOpensAt).getTime();
    const regClose = new Date(event.registrationClosesAt).getTime();
    const earlyOpen = event.earlyAccessOpensAt ? new Date(event.earlyAccessOpensAt).getTime() : null;

    if (event.seatsReserved >= event.capacity) {
      throw new AppError('SOLD_OUT', 409, 'Event is sold out');
    }
    if (t > regClose || t >= new Date(event.startsAt).getTime()) {
      throw new AppError('REGISTRATION_CLOSED', 422, 'Registration is closed');
    }
    if (earlyOpen != null && t >= earlyOpen && t < regOpen) {
      if (!hasEarlyAccess) {
        throw new AppError('REGISTRATION_NOT_OPEN', 422, 'Registration is not open yet');
      }
      return 'EARLY_ACCESS';
    }
    if (t < regOpen) {
      throw new AppError('REGISTRATION_NOT_OPEN', 422, 'Registration is not open yet');
    }
    return 'OPEN';
  }

  function quoteTicket(event, benefits, earlyBirdRemaining) {
    const now = nowFn();
    const isMember = benefits != null;
    salesWindow(event, isMember && benefits?.earlyBirdAccess, now);

    if (!isMember && (event.nonMemberPricePaise == null || event.non_member_price_paise === null)) {
      if (event.nonMemberPricePaise == null) {
        throw new AppError('MEMBERS_ONLY_EVENT', 422, 'This event is for members only');
      }
    }

    const nonMemberPrice = event.nonMemberPricePaise ?? event.non_member_price_paise;
    if (!isMember && nonMemberPrice == null) {
      throw new AppError('MEMBERS_ONLY_EVENT', 422, 'This event is for members only');
    }

    const memberPrice = Number(event.memberPricePaise ?? event.member_price_paise);
    const memberDiscountEligible = event.memberDiscountEligible ?? event.member_discount_eligible ?? true;

    const base = isMember ? memberPrice : Number(nonMemberPrice);
    const memDisc =
      isMember && memberDiscountEligible ? discount(base, benefits.eventDiscountBps ?? benefits.event_discount_bps) : 0;
    const regular = {
      tier: isMember ? PRICE_TIERS.MEMBER_REGULAR : PRICE_TIERS.NON_MEMBER_REGULAR,
      list: base,
      disc: memDisc,
      final: base - memDisc,
    };

    const ebMember = event.earlyBirdMemberPricePaise ?? event.early_bird_member_price_paise;
    const ebNonMember = event.earlyBirdNonMemberPricePaise ?? event.early_bird_non_member_price_paise;
    const ebEnds = event.earlyBirdEndsAt ?? event.early_bird_ends_at;
    const ebPrice = isMember ? ebMember : ebNonMember;

    const ebOk =
      ebPrice != null &&
      ebEnds &&
      now.getTime() <= new Date(ebEnds).getTime() &&
      (earlyBirdRemaining == null || earlyBirdRemaining > 0);

    if (ebOk) {
      const ebList = Number(ebPrice);
      let ebDisc = 0;
      if (
        combinationMode === 'STACK' &&
        isMember &&
        memberDiscountEligible
      ) {
        ebDisc = discount(ebList, benefits.eventDiscountBps ?? benefits.event_discount_bps);
      }
      const eb = {
        tier: isMember ? PRICE_TIERS.MEMBER_EARLY_BIRD : PRICE_TIERS.NON_MEMBER_EARLY_BIRD,
        list: ebList,
        disc: ebDisc,
        final: ebList - ebDisc,
        usesEarlyBird: true,
      };
      const chosen = eb.final <= regular.final ? eb : regular;
      if (chosen.final === 0) {
        return { ...chosen, tier: PRICE_TIERS.FREE };
      }
      return chosen;
    }

    if (regular.final === 0) {
      return { ...regular, tier: PRICE_TIERS.FREE };
    }
    return { ...regular, usesEarlyBird: false };
  }

  return {
    combinationMode,
    quoteTicket,
    salesWindow,
  };
}
