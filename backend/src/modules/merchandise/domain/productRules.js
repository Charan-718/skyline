// Catalogue rules (LLD §2.8; OQ-20). Pure.

export const PRODUCT_STATUSES = Object.freeze(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);

const TRANSITIONS = Object.freeze({
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['INACTIVE', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
});

export const canTransitionProduct = (from, to) => TRANSITIONS[from].includes(to);

/** Offer fields are all-or-nothing; the window must be positive; the offer must be cheaper. */
export function offerProblems({ pricePaise, offerPricePaise, offerStartsAt, offerEndsAt }) {
  const problems = [];
  const any = offerPricePaise != null || offerStartsAt != null || offerEndsAt != null;
  if (!any) return problems;
  if (offerPricePaise == null || offerStartsAt == null || offerEndsAt == null) {
    problems.push({ path: 'offerPricePaise', message: 'offerPricePaise, offerStartsAt and offerEndsAt go together' });
    return problems;
  }
  if (new Date(offerEndsAt) <= new Date(offerStartsAt)) problems.push({ path: 'offerEndsAt', message: 'offerEndsAt must be after offerStartsAt' });
  if (offerPricePaise >= pricePaise) problems.push({ path: 'offerPricePaise', message: 'offerPricePaise must be below pricePaise' });
  return problems;
}

/** Orderable iff the product is ACTIVE and the size is active (LLD §2.8). */
export const isOrderable = (product, variant) => product.status === 'ACTIVE' && variant.is_active === true;

/** The product as PricingPolicy sees it (LLD §2.6 field names). */
export const pricingView = (p) => ({
  pricePaise: p.price_paise,
  memberDiscountEligible: p.member_discount_eligible,
  availableToNonMembers: p.available_to_non_members,
  offerPricePaise: p.offer_price_paise,
  offerStartsAt: p.offer_starts_at,
  offerEndsAt: p.offer_ends_at,
});
