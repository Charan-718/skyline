import { FIELDS, ORGANIZER_FIELDS } from './fields.js';
import { addDays, formatLocal, isValidDate, isValidTime, localToUtc, utcToLocal } from './time.js';

// Applies the model's operations to a draft (create) or to the saved event plus pending changes
// (edit). This is where hallucination is stopped:
//   - only known fields and operations; organizers can touch description and venue only
//   - a value marked "user" must be traceable to words the user actually typed (its phrase)
//   - a value marked "generated" is accepted for title and description only
//   - money, numbers and dates are range-checked; times in the past are refused, not applied
//   - dates are resolved here from local date/time strings; partial dates wait for the missing part
//
// Returns { draft, partials, sources, problems, interpretation }.
//   draft     API-shaped values (ISO instants, paise)
//   partials  datetime pieces still missing their date or time, e.g. { start: { date } }
//   problems  [{ field, message }] -> become questions; the field is left unchanged

const MAX_RUPEES = 1_000_000;
const MAX_SHIFT_MINUTES = 366 * 24 * 60;
const MAX_DURATION_MINUTES = 14 * 24 * 60;

const normalize = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}₹.:/-]+/gu, ' ')
    .trim();

/**
 * A "user" value must come from the user's words: the phrase appears in what they typed, or all of
 * its meaningful tokens (numbers, words of 3+ letters) do. Lenient on wording, strict on facts.
 */
export function phraseIsGrounded(phrase, userText) {
  const p = normalize(phrase);
  const text = normalize(userText);
  if (!p) return false;
  if (text.includes(p)) return true;
  const tokens = p.split(' ').filter((t) => /\d/.test(t) || t.length >= 3);
  return tokens.length > 0 && tokens.every((t) => text.includes(t));
}

function rupeesToPaise(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_RUPEES) return null;
  return Math.round(n * 100);
}

const cloneJson = (v) => JSON.parse(JSON.stringify(v ?? {}));

export function applyOps({ base, partials = {}, ops, role = 'CLUB_HEAD', now, timeZone, userText }) {
  const draft = { ...base };
  const pending = cloneJson(partials);
  const sources = {};
  const problems = [];
  const interpretation = [];
  const problem = (field, message) => problems.push({ field, message });
  const datetimeSet = new Map(); // field -> op (this turn)
  const shifts = [];
  let duration = pending.durationMinutes?.minutes ?? null;
  let durationPhrase = pending.durationMinutes?.phrase ?? null;

  const setValue = (key, value, source) => {
    draft[FIELDS[key].api] = value;
    sources[FIELDS[key].api] = source;
  };

  for (const op of ops) {
    const def = FIELDS[op.field];
    if (!def) continue;
    if (role !== 'CLUB_HEAD' && !ORGANIZER_FIELDS.includes(op.field)) {
      problem(op.field, `Only the club head can change the ${def.label.toLowerCase()}. You can change the description and venue.`);
      continue;
    }
    if (op.source === 'generated' && !def.generatable) continue; // never invent facts
    if (op.source !== 'generated' && !phraseIsGrounded(op.phrase, userText)) continue;

    if (op.op === 'clear') {
      if (!def.clearable) {
        problem(op.field, `The ${def.label.toLowerCase()} is required and can't be removed.`);
        continue;
      }
      const keys = def.kind === 'group' ? def.members : [op.field];
      for (const k of keys) {
        setValue(k, k === 'description' ? '' : null, 'user');
        delete pending[k];
        datetimeSet.delete(k);
      }
      if (op.field === 'nonMemberPrice') setValue('earlyBirdNonMemberPrice', null, 'user'); // members only: no non-member early bird
      continue;
    }

    switch (def.kind) {
      case 'text': {
        if (op.op !== 'set') break;
        const value = String(op.text ?? '').trim();
        if (!value) {
          problem(op.field, `What should the ${def.label.toLowerCase()} be?`);
        } else if (value.length > def.max) {
          problem(op.field, `The ${def.label.toLowerCase()} can be at most ${def.max} characters.`);
        } else {
          setValue(op.field, value, op.source === 'generated' ? 'generated' : 'user');
        }
        break;
      }
      case 'boolean':
        if (op.op === 'set' && typeof op.boolean === 'boolean') setValue(op.field, op.boolean, 'user');
        break;
      case 'money':
      case 'integer': {
        const current = draft[def.api] == null ? null : Number(draft[def.api]);
        const unit = def.kind === 'money' ? 100 : 1;
        let next = null;
        if (op.op === 'set') next = def.kind === 'money' ? rupeesToPaise(op.number) : op.number;
        else if (op.op === 'adjust' || op.op === 'scale') {
          if (current == null) {
            problem(op.field, `There is no ${def.label.toLowerCase()} yet to change. What should it be?`);
            break;
          }
          if (typeof op.number !== 'number' || !Number.isFinite(op.number)) break;
          next = op.op === 'adjust' ? current + Math.round(op.number * unit) : Math.round((current * op.number) / unit) * unit;
        } else break;
        if (def.kind === 'integer') {
          if (!Number.isInteger(next) || next < def.min || next > def.max) {
            problem(op.field, `The ${def.label.toLowerCase()} must be a whole number between ${def.min} and ${def.max.toLocaleString('en-IN')}.`);
            break;
          }
        } else if (next == null || next < 0 || next > MAX_RUPEES * 100) {
          problem(op.field, `The ${def.label.toLowerCase()} must be an amount in rupees between ₹0 and ₹${MAX_RUPEES.toLocaleString('en-IN')}.`);
          break;
        }
        setValue(op.field, next, 'user');
        break;
      }
      case 'duration':
        if (op.op === 'set' && Number.isInteger(op.minutes) && op.minutes > 0 && op.minutes <= MAX_DURATION_MINUTES) {
          duration = op.minutes;
          durationPhrase = op.phrase;
        } else problem('end', 'How long does the event last?');
        break;
      case 'datetime':
        if (op.op === 'set') {
          const piece = { ...(pending[op.field] ?? {}) };
          if (op.date) piece.date = op.date;
          if (op.time) piece.time = op.time;
          pending[op.field] = piece;
          datetimeSet.set(op.field, op);
        } else if (op.op === 'shift') {
          if (Number.isInteger(op.minutes) && op.minutes !== 0 && Math.abs(op.minutes) <= MAX_SHIFT_MINUTES) shifts.push(op);
        }
        break;
      default:
        break;
    }
  }

  // Resolve datetimes in dependency order: start first, so a bare end time can borrow its date.
  const ORDER = ['start', 'end', 'registrationOpens', 'registrationCloses', 'earlyAccessOpens', 'earlyBirdEnds'];
  for (const key of ORDER) {
    const piece = pending[key];
    if (!piece) continue;
    const def = FIELDS[key];
    const current = draft[def.api] ? utcToLocal(draft[def.api], timeZone) : null;
    let date = piece.date ?? current?.date ?? null;
    const time = piece.time ?? current?.time ?? null;
    const startIso = draft.startsAt;
    const borrowsStartDate = key === 'end' && !piece.date && !current && startIso;
    if (borrowsStartDate) date = utcToLocal(startIso, timeZone).date;
    if (!date || !time) continue; // still partial: a question asks for the missing piece

    if (!isValidDate(date)) {
      problem(key, `${date} isn't a real date. Which date should the ${def.label.toLowerCase()} be?`);
      delete pending[key];
      continue;
    }
    if (!isValidTime(time)) {
      problem(key, `What time should the ${def.label.toLowerCase()} be?`);
      delete pending[key];
      continue;
    }
    let instant = localToUtc(date, time, timeZone);
    let note = '';
    if (key === 'end' && !piece.date && startIso && instant <= new Date(startIso)) {
      instant = localToUtc(addDays(date, 1), time, timeZone); // "6 pm to 2 am" ends the next day
      note = ' (the next day)';
    }
    delete pending[key];
    if (def.future && instant <= now) {
      problem(key, `${formatLocal(instant, timeZone)} is in the past. Please give a future date and time for the ${def.label.toLowerCase()}.`);
      continue;
    }
    const op = datetimeSet.get(key);
    setValue(key, instant.toISOString(), 'user');
    interpretation.push({ field: def.api, phrase: op?.phrase ?? '', resolved: `${formatLocal(instant, timeZone)}${note}` });
  }

  for (const op of shifts) {
    const def = FIELDS[op.field];
    if (!draft[def.api]) {
      problem(op.field, `There is no ${def.label.toLowerCase()} yet to move. When should it be?`);
      continue;
    }
    const instant = new Date(new Date(draft[def.api]).getTime() + op.minutes * 60_000);
    if (def.future && instant <= now) {
      problem(op.field, `That would put the ${def.label.toLowerCase()} in the past (${formatLocal(instant, timeZone)}).`);
      continue;
    }
    setValue(op.field, instant.toISOString(), 'user');
    interpretation.push({ field: def.api, phrase: op.phrase, resolved: formatLocal(instant, timeZone) });
  }

  // "for 2 hours": end = start + duration, unless an explicit end was given this turn.
  delete pending.durationMinutes;
  if (duration != null) {
    if (draft.startsAt && !datetimeSet.has('end')) {
      const end = new Date(new Date(draft.startsAt).getTime() + duration * 60_000);
      setValue('end', end.toISOString(), 'user');
      interpretation.push({ field: 'endsAt', phrase: durationPhrase ?? '', resolved: formatLocal(end, timeZone) });
    } else if (!draft.startsAt) {
      pending.durationMinutes = { minutes: duration, phrase: durationPhrase };
    }
  }

  return { draft, partials: pending, sources, problems, interpretation };
}
