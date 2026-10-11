// Event schedule and pricing rules (pure). Used by manual create, update and publish, and by the
// event agent before it offers a draft, so both paths accept exactly the same events.
//
// checkEventRules(event, { now, mode, changed, seatsReserved, earlyBirdReserved }) -> { field: message }
//   event   camelCase values (ISO strings or Dates for times, paise numbers for prices)
//   mode    'create' | 'update' | 'publish'
//   changed (update only) field names in the patch: on update a rule is reported only when one of
//           its fields is being changed, so an old event with odd data can still get small edits.
// Field keys match the API body (startsAt, registrationClosesAt, memberPricePaise, …).

const ms = (v) => (v == null || v === '' ? null : new Date(v).getTime());
const has = (v) => v !== undefined && v !== null;

const RULES = [
  {
    field: 'registrationClosesAt',
    fields: ['registrationOpensAt', 'registrationClosesAt'],
    test: (e) => !(ms(e.registrationOpensAt) != null && ms(e.registrationClosesAt) != null) || ms(e.registrationOpensAt) < ms(e.registrationClosesAt),
    message: 'Must be after registration opens.',
  },
  {
    field: 'registrationClosesAt',
    fields: ['registrationClosesAt', 'startsAt'],
    test: (e) => !(ms(e.registrationClosesAt) != null && ms(e.startsAt) != null) || ms(e.registrationClosesAt) <= ms(e.startsAt),
    message: 'Registration must close before the event starts.',
  },
  {
    field: 'endsAt',
    fields: ['startsAt', 'endsAt'],
    test: (e) => !(ms(e.startsAt) != null && ms(e.endsAt) != null) || ms(e.startsAt) < ms(e.endsAt),
    message: 'Must be after the start.',
  },
  {
    field: 'earlyAccessOpensAt',
    fields: ['earlyAccessOpensAt', 'registrationOpensAt'],
    test: (e) => ms(e.earlyAccessOpensAt) == null || ms(e.registrationOpensAt) == null || ms(e.earlyAccessOpensAt) < ms(e.registrationOpensAt),
    message: 'Must be before general registration opens.',
  },
  {
    field: 'earlyBirdEndsAt',
    fields: ['earlyBirdMemberPricePaise', 'earlyBirdNonMemberPricePaise', 'earlyBirdEndsAt'],
    test: (e) => !(has(e.earlyBirdMemberPricePaise) || has(e.earlyBirdNonMemberPricePaise)) || ms(e.earlyBirdEndsAt) != null,
    message: 'Set when early-bird pricing ends.',
  },
  {
    field: 'earlyBirdEndsAt',
    fields: ['earlyBirdEndsAt', 'registrationOpensAt', 'registrationClosesAt', 'earlyAccessOpensAt'],
    test: (e) => {
      const end = ms(e.earlyBirdEndsAt);
      if (end == null) return true;
      const opens = ms(e.earlyAccessOpensAt) ?? ms(e.registrationOpensAt);
      const closes = ms(e.registrationClosesAt);
      return (opens == null || end > opens) && (closes == null || end <= closes);
    },
    message: 'Must fall within the registration window.',
  },
  {
    field: 'earlyBirdNonMemberPricePaise',
    fields: ['earlyBirdNonMemberPricePaise', 'nonMemberPricePaise'],
    test: (e) => !has(e.earlyBirdNonMemberPricePaise) || has(e.nonMemberPricePaise),
    message: 'Members-only events cannot have a non-member early-bird price.',
  },
  {
    field: 'earlyBirdQuantity',
    fields: ['earlyBirdQuantity', 'earlyBirdMemberPricePaise', 'earlyBirdNonMemberPricePaise'],
    test: (e) => !has(e.earlyBirdQuantity) || has(e.earlyBirdMemberPricePaise) || has(e.earlyBirdNonMemberPricePaise),
    message: 'Set an early-bird price, or leave the early-bird quantity empty.',
  },
];

// Times that must lie in the future when they are set (create) or changed (update).
const FUTURE_FIELDS = ['startsAt', 'endsAt', 'registrationClosesAt'];

export function checkEventRules(event, { now = new Date(), mode = 'create', changed = null, seatsReserved = 0, earlyBirdReserved = 0 } = {}) {
  const errors = {};
  const touched = (fields) => mode !== 'update' || fields.some((f) => changed?.includes(f));
  const add = (field, message) => {
    if (!errors[field]) errors[field] = message;
  };

  for (const rule of RULES) {
    if (touched(rule.fields) && !rule.test(event)) add(rule.field, rule.message);
  }

  const t = now.getTime();
  if (mode === 'create' || mode === 'update') {
    for (const f of FUTURE_FIELDS) {
      if (!touched([f])) continue;
      const v = ms(event[f]);
      if (v != null && v <= t) add(f, 'Must be in the future.');
    }
  }
  if (mode === 'publish') {
    if (ms(event.startsAt) != null && ms(event.startsAt) <= t) add('startsAt', 'The event has already started. Move it to a future date before publishing.');
    else if (ms(event.registrationClosesAt) != null && ms(event.registrationClosesAt) <= t) {
      add('registrationClosesAt', 'Registration has already closed. Move it to a future date before publishing.');
    }
  }

  if (mode === 'update') {
    if (touched(['capacity']) && has(event.capacity) && event.capacity < seatsReserved) add('capacity', `Minimum ${seatsReserved} (seats already sold or held).`);
    if (touched(['earlyBirdQuantity']) && has(event.earlyBirdQuantity) && event.earlyBirdQuantity < earlyBirdReserved) {
      add('earlyBirdQuantity', `Minimum ${earlyBirdReserved} (early-bird tickets already sold or held).`);
    }
  }
  return errors;
}

/** Field keys whose value differs between the saved event and the patch (times compared as instants). */
export function changedKeys(event, patch) {
  return Object.keys(patch).filter((k) => {
    if (patch[k] === undefined) return false;
    const a = event[k];
    const b = patch[k];
    if (a instanceof Date || b instanceof Date || /At$/.test(k)) return ms(a) !== ms(b);
    // BIGINT columns (prices) come back from pg as strings.
    if (typeof b === 'number' && typeof a === 'string' && a.trim() !== '') return Number(a) !== b;
    return (a ?? null) !== (b ?? null);
  });
}
