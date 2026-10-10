import { describe, it } from 'vitest';

// TC-MER-05 — member merch discount + offer (LLD §2.6 quoteMerchItem, §10).
// Decision OQ-07 (APPROVED): PricingPolicy is Group 1's (T-40). Group 2 does not implement a
// substitute; this test is enabled against pricing.quoteMerchItem when Group 1 merges it.
describe('TC-MER-05 member merch discount + offer', () => {
  it.skip('requires Group 1 PricingPolicy — LIST / MEMBER_DISCOUNT / OFFER / OFFER_PLUS_MEMBER per §2.6 in BEST_OF and STACK', () => {});
});
