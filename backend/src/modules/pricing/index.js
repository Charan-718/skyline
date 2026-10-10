// TODO(group1): interface stub. Group 1 (T-40) owns PricingPolicy (LLD §2.6); Group 2 must not
// implement a substitute (OQ-07 APPROVED). Merchandise calls this for every quote and order.

/**
 * quoteMerchItem(product, benefits | null, now, { mode }) ->
 *   { listPricePaise, discountPaise, finalPricePaise, priceRule }   (per unit, integer paise)
 * product: { pricePaise, memberDiscountEligible, availableToNonMembers, offerPricePaise,
 *            offerStartsAt, offerEndsAt }
 * benefits: memberships.getActiveBenefits(...) result; mode: PRICING_COMBINATION_MODE (OD-01).
 * Throws AppError MEMBERS_ONLY_PRODUCT when benefits is null and the product is members-only.
 */
export async function quoteMerchItem(_product, _benefits, _now, _options) {
  throw new Error('TODO(group1): pricing.quoteMerchItem is not implemented yet');
}
