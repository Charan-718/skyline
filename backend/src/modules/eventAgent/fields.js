// The fields the agent can talk about, in user-friendly units (rupees, local times), and how each maps
// to the event API body (paise, ISO instants). The model must use these keys and nothing else.

export const FIELDS = Object.freeze({
  title: { kind: 'text', api: 'title', label: 'Title', required: true, max: 150, generatable: true },
  description: { kind: 'text', api: 'description', label: 'Description', max: 5000, generatable: true, clearable: true },
  venue: { kind: 'text', api: 'venue', label: 'Venue', required: true, max: 200 },
  start: { kind: 'datetime', api: 'startsAt', label: 'Start', required: true, future: true },
  end: { kind: 'datetime', api: 'endsAt', label: 'End', required: true, future: true },
  registrationOpens: { kind: 'datetime', api: 'registrationOpensAt', label: 'Registration opens', required: true },
  registrationCloses: { kind: 'datetime', api: 'registrationClosesAt', label: 'Registration closes', required: true, future: true },
  earlyAccessOpens: { kind: 'datetime', api: 'earlyAccessOpensAt', label: 'Member early access opens', clearable: true },
  capacity: { kind: 'integer', api: 'capacity', label: 'Capacity', required: true, min: 1, max: 100_000 },
  memberPrice: { kind: 'money', api: 'memberPricePaise', label: 'Member price', required: true },
  nonMemberPrice: { kind: 'money', api: 'nonMemberPricePaise', label: 'Non-member price', clearable: true },
  memberDiscountEligible: { kind: 'boolean', api: 'memberDiscountEligible', label: 'Plan discounts apply' },
  earlyBirdMemberPrice: { kind: 'money', api: 'earlyBirdMemberPricePaise', label: 'Early-bird member price', clearable: true },
  earlyBirdNonMemberPrice: { kind: 'money', api: 'earlyBirdNonMemberPricePaise', label: 'Early-bird non-member price', clearable: true },
  earlyBirdEnds: { kind: 'datetime', api: 'earlyBirdEndsAt', label: 'Early bird ends', clearable: true, future: true },
  earlyBirdQuantity: { kind: 'integer', api: 'earlyBirdQuantity', label: 'Early-bird tickets', clearable: true, min: 1, max: 100_000 },
  // Pseudo-fields: "for 2 hours" sets the end from the start; "remove early bird" clears all four.
  durationMinutes: { kind: 'duration', label: 'Duration' },
  earlyBird: { kind: 'group', label: 'Early bird', clearable: true, members: ['earlyBirdMemberPrice', 'earlyBirdNonMemberPrice', 'earlyBirdEnds', 'earlyBirdQuantity'] },
});

export const FIELD_KEYS = Object.freeze(Object.keys(FIELDS));
export const OPS = Object.freeze(['set', 'adjust', 'scale', 'shift', 'clear']);

export const API_TO_FIELD = Object.freeze(Object.fromEntries(Object.entries(FIELDS).filter(([, f]) => f.api).map(([k, f]) => [f.api, k])));

/** API fields a create draft must have before it can be saved. nonMemberPricePaise may be null (members only) but must be decided. */
export const REQUIRED_API = Object.freeze(['title', 'venue', 'startsAt', 'endsAt', 'registrationOpensAt', 'registrationClosesAt', 'capacity', 'memberPricePaise', 'nonMemberPricePaise']);

/** What an organizer (not the club head) may change; same rule as PATCH /events/:id. */
export const ORGANIZER_FIELDS = Object.freeze(['description', 'venue']);

export const labelOf = (apiField) => FIELDS[API_TO_FIELD[apiField]]?.label ?? apiField;
