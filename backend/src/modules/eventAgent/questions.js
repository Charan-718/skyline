import { FIELDS, labelOf } from './fields.js';
import { formatLocal } from './time.js';
import { formatRupees } from '../assistant/eventFacts.js';

// Questions are written here, from a fixed list, so they never contain invented facts. The model
// only contributes ambiguity questions (with options read from the calendar), which are length-capped.
// A question may carry `options` (sent back as the user's next message when clicked) or a
// `suggestion` ({ label, patch }) that the client applies directly — e.g. the default registration window.

const MAX_QUESTIONS = 4;
const FIVE_MIN = 5 * 60_000;
const HOUR = 60 * 60_000;

const ceilTo5Min = (t) => Math.ceil(t / FIVE_MIN) * FIVE_MIN;
const fieldOf = (key) => FIELDS[key]?.api ?? key;

const dayLabel = (date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/,(?=\s\d{4})/, '');

// [what happens, as a verb phrase] per date/time field, for natural questions.
const HAPPENS = {
  start: ['does it start', 'it starts'],
  end: ['does it end', 'it ends'],
  registrationOpens: ['does registration open', 'registration opens'],
  registrationCloses: ['does registration close', 'registration closes'],
  earlyAccessOpens: ['does member early access open', 'member early access opens'],
  earlyBirdEnds: ['does the early-bird price end', 'the early-bird price ends'],
};

function datetimeQuestion(key, piece) {
  const [ask, said] = HAPPENS[key] ?? [`is the ${FIELDS[key].label.toLowerCase()}`, FIELDS[key].label.toLowerCase()];
  if (piece?.date && !piece?.time) return `What time ${ask} on ${dayLabel(piece.date)}?`;
  if (piece?.time && !piece?.date) return `On which date ${said} (at ${piece.time})?`;
  return null;
}

const localDate = (iso, timeZone) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : null);

/**
 * Date-level schedule problems that can be seen before the times are known, e.g. registration
 * closing on a later day than the event starts. Returns [{ field, text }].
 */
function dateOrderProblems(draft, partials, timeZone) {
  const dayOf = (key) => partials[key]?.date ?? localDate(draft[FIELDS[key].api], timeZone);
  const start = dayOf('start');
  const out = [];
  const closes = dayOf('registrationCloses');
  const opens = dayOf('registrationOpens');
  const end = dayOf('end');
  if (start && closes && closes > start) {
    out.push({ field: 'registrationClosesAt', text: `Registration would close on ${dayLabel(closes)}, after the event starts on ${dayLabel(start)}. Registration must close before the start — when should it close?` });
  }
  if (opens && closes && opens > closes) {
    out.push({ field: 'registrationOpensAt', text: `Registration would open on ${dayLabel(opens)}, after it closes on ${dayLabel(closes)}. When should registration open?` });
  }
  if (start && end && end < start) out.push({ field: 'endsAt', text: `The event would end on ${dayLabel(end)}, before it starts on ${dayLabel(start)}. When does it end?` });
  return out;
}

/** Default registration window: opens now (rounded up to 5 min), closes 1 hour before the start. */
export function registrationSuggestion(draft, now, timeZone) {
  if (!draft.startsAt) return null;
  const start = new Date(draft.startsAt).getTime();
  const opens = draft.registrationOpensAt ? new Date(draft.registrationOpensAt).getTime() : ceilTo5Min(now.getTime());
  let closes = draft.registrationClosesAt ? new Date(draft.registrationClosesAt).getTime() : start - HOUR;
  if (!draft.registrationClosesAt && closes <= opens) closes = start;
  if (closes <= opens || closes > start) return null;
  const patch = {};
  if (!draft.registrationOpensAt) patch.registrationOpensAt = new Date(opens).toISOString();
  if (!draft.registrationClosesAt) patch.registrationClosesAt = new Date(closes).toISOString();
  const parts = [];
  if (patch.registrationOpensAt) parts.push(`opens now (${formatLocal(opens, timeZone)})`);
  if (patch.registrationClosesAt) parts.push(`closes ${closes === start ? 'when the event starts' : '1 hour before the start'} (${formatLocal(closes, timeZone)})`);
  return { label: 'Use suggested', description: parts.join(' and '), patch };
}

export function buildQuestions({ mode, draft, partials = {}, problems = [], ambiguities = [], ruleErrors = {}, now, timeZone }) {
  const out = [];
  const asked = new Set();
  const push = (q) => {
    if (asked.has(q.field)) return;
    asked.add(q.field);
    out.push(q);
  };

  for (const a of ambiguities) {
    push({
      id: `ambiguous:${a.field}`,
      field: fieldOf(a.field),
      text: String(a.question).slice(0, 300),
      options: (a.options ?? []).slice(0, 5).map((o) => String(o).slice(0, 120)),
    });
  }
  for (const p of problems) push({ id: `problem:${p.field}`, field: fieldOf(p.field), text: p.message });

  for (const [apiField, message] of Object.entries(ruleErrors)) {
    const q = { id: `rule:${apiField}`, field: apiField, text: `${labelOf(apiField)}: ${message}` };
    if (apiField === 'registrationClosesAt' && /before the event starts/.test(message) && draft.startsAt) {
      const fix = registrationSuggestion({ ...draft, registrationClosesAt: undefined }, now, timeZone);
      if (fix?.patch.registrationClosesAt) q.suggestion = { label: 'Close 1 hour before the start', description: fix.description, patch: { registrationClosesAt: fix.patch.registrationClosesAt } };
    }
    if (apiField === 'earlyBirdEndsAt' && /Set when/.test(message)) q.text = 'Until when should the early-bird prices apply?';
    push(q);
  }

  for (const p of dateOrderProblems(draft, partials, timeZone)) push({ id: `order:${p.field}`, field: p.field, text: p.text });

  // Any date or time still waiting for its other half (start, end, registration, early bird, …).
  for (const [key, piece] of Object.entries(partials)) {
    if (key === 'durationMinutes' || !FIELDS[key]) continue;
    const text = datetimeQuestion(key, piece);
    if (text) push({ id: `partial:${FIELDS[key].api}`, field: FIELDS[key].api, text });
  }

  if (mode === 'create') {
    for (const key of ['start', 'end']) {
      const api = FIELDS[key].api;
      if (draft[api]) continue;
      const partial = datetimeQuestion(key, partials[key]);
      if (partial) push({ id: `missing:${api}`, field: api, text: partial });
      else if (key === 'start') push({ id: 'missing:startsAt', field: api, text: 'When does it start? A date and time works, like “tomorrow at 6 pm”.' });
      else if (!partials.durationMinutes) push({ id: 'missing:endsAt', field: api, text: 'When does it end? Give an end time or a duration, like “2 hours”.' });
    }
    if (!draft.venue) push({ id: 'missing:venue', field: 'venue', text: 'Where will it be held?' });
    if (draft.capacity == null) push({ id: 'missing:capacity', field: 'capacity', text: 'How many people can attend?' });
    if (draft.memberPricePaise == null) push({ id: 'missing:memberPricePaise', field: 'memberPricePaise', text: 'What do members pay? Say “free” if there is no charge.' });
    if (draft.nonMemberPricePaise === undefined) {
      const q = { id: 'missing:nonMemberPricePaise', field: 'nonMemberPricePaise', text: 'Can non-members attend? If yes, what do they pay?', suggestions: [{ label: 'Members only', patch: { nonMemberPricePaise: null, earlyBirdNonMemberPricePaise: null } }] };
      if (draft.memberPricePaise != null) q.suggestions.push({ label: `Same as members (${formatRupees(draft.memberPricePaise)})`, patch: { nonMemberPricePaise: draft.memberPricePaise } });
      push(q);
    }
    if (!draft.registrationOpensAt || !draft.registrationClosesAt) {
      const suggestion = registrationSuggestion(draft, now, timeZone);
      if (suggestion) push({ id: 'missing:registration', field: 'registrationWindow', text: `When should registration open and close? Suggested: ${suggestion.description}.`, suggestion });
      else if (draft.startsAt) push({ id: 'missing:registration', field: 'registrationWindow', text: 'When should registration open and close?' });
    }
    if (!draft.title) push({ id: 'missing:title', field: 'title', text: 'What should the event be called?' });
  }

  return out.slice(0, MAX_QUESTIONS);
}

