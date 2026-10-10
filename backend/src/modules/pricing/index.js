import { applyBps } from '../../shared/money.js';
import { appError } from '../../shared/errors.js';

/**
 * quoteMerchItem(product, benefits | null, now, { mode }) — live pricing for merchandise (LLD §2.6).
 */
export async function quoteMerchItem(product, benefits, now, { mode = 'BEST_OF' } = {}) {
  if (!benefits && !product.availableToNonMembers) {
    throw appError('MEMBERS_ONLY_PRODUCT');
  }
  let listPricePaise = Number(product.pricePaise);
  let priceRule = 'LIST';
  const offerStart = product.offerStartsAt ? new Date(product.offerStartsAt).getTime() : null;
  const offerEnd = product.offerEndsAt ? new Date(product.offerEndsAt).getTime() : null;
  const t = now.getTime();
  if (product.offerPricePaise != null && offerStart != null && offerEnd != null && t >= offerStart && t <= offerEnd) {
    listPricePaise = Number(product.offerPricePaise);
    priceRule = 'OFFER';
  }
  let discountPaise = 0;
  if (benefits && product.memberDiscountEligible !== false) {
    const memberDisc = applyBps(listPricePaise, benefits.merchDiscountBps ?? 0);
    if (memberDisc > 0) {
      discountPaise = memberDisc;
      priceRule = 'MEMBER_DISCOUNT';
    }
  }
  const finalPricePaise = Math.max(0, listPricePaise - discountPaise);
  return { listPricePaise, discountPaise, finalPricePaise, priceRule };
}

export { createPricingPolicy } from './PricingPolicy.js';
