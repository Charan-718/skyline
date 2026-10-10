const EDITABLE_BY_ORG = new Set(['description', 'venue']);

const EVENT_PATCH_KEYS = {
  title: 'title',
  description: 'description',
  venue: 'venue',
  capacity: 'capacity',
  memberPricePaise: 'member_price_paise',
  nonMemberPricePaise: 'non_member_price_paise',
  memberDiscountEligible: 'member_discount_eligible',
  earlyBirdMemberPricePaise: 'early_bird_member_price_paise',
  earlyBirdNonMemberPricePaise: 'early_bird_non_member_price_paise',
  earlyBirdQuantity: 'early_bird_quantity',
  earlyBirdEndsAt: 'early_bird_ends_at',
  earlyAccessOpensAt: 'early_access_opens_at',
  registrationOpensAt: 'registration_opens_at',
  registrationClosesAt: 'registration_closes_at',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
};

export function patchToSnake(body) {
  const patch = {};
  for (const [camel, snake] of Object.entries(EVENT_PATCH_KEYS)) {
    if (body[camel] !== undefined) patch[snake] = body[camel];
  }
  return patch;
}

export function changedFields(event, body) {
  return Object.keys(EVENT_PATCH_KEYS).filter(
    (k) => body[k] !== undefined && body[k] !== event[k],
  );
}

export function assertOrganizerMayEdit(head, changed) {
  if (head) return;
  if (changed.some((k) => !EDITABLE_BY_ORG.has(k))) {
    throw new Error('FIELD_NOT_EDITABLE');
  }
}

export { EDITABLE_BY_ORG, EVENT_PATCH_KEYS };
