import { describe, expect, it } from 'vitest';
import { applyOps, phraseIsGrounded } from '../../src/modules/eventAgent/ops.js';
import { buildQuestions, registrationSuggestion } from '../../src/modules/eventAgent/questions.js';
import { changeWarnings, describeChanges } from '../../src/modules/eventAgent/review.js';
import { calendarLines, formatLocal, localToUtc } from '../../src/modules/eventAgent/time.js';

// Event agent core (no model): date resolution, anti-hallucination rules, questions, edit review.
const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-11T06:30:00Z'); // Sun 11 Oct 2026, 12:00 IST
const op = (field, o, extra = {}) => ({ field, op: o, source: 'user', phrase: extra.phrase ?? 'x', ...extra });
// Unless a test says otherwise, the user is taken to have typed every phrase the ops quote
// (grounding itself is tested separately below).
const run = (ops, { base = {}, partials, role, text } = {}) =>
  applyOps({ base, partials, ops, role, now: NOW, timeZone: TZ, userText: text ?? ops.map((o) => o.phrase).join(' | ') });
const ist = (date, time) => localToUtc(date, time, TZ).toISOString();

describe('time helpers', () => {
  it('converts IST wall time to UTC and rejects impossible dates', () => {
    expect(ist('2026-10-12', '18:00')).toBe('2026-10-12T12:30:00.000Z');
    expect(localToUtc('2026-02-30', '10:00', TZ)).toBeNull();
    expect(localToUtc('2026-10-12', '7', TZ)).toBeNull();
    expect(formatLocal('2026-10-12T12:30:00Z', TZ)).toBe('Mon, 12 Oct 2026, 6:00 pm IST');
  });
  it('calendar marks yesterday, today and tomorrow in IST', () => {
    expect(calendarLines(NOW, TZ, 2)).toEqual(['2026-10-10 Saturday (yesterday)', '2026-10-11 Sunday (today)', '2026-10-12 Monday (tomorrow)']);
    // 23:30 IST on the 11th is still the 11th even though UTC is 18:00
    expect(calendarLines(new Date('2026-10-11T18:00:00Z'), TZ, 1)[1]).toBe('2026-10-11 Sunday (today)');
  });
});

describe('grounding: values must come from the user', () => {
  const text = 'Photo walk tomorrow 6pm-8pm at the lake, 30 people, free for members, ₹50 for others';
  it('accepts phrases the user typed, even reworded slightly', () => {
    expect(phraseIsGrounded('at the lake', text)).toBe(true);
    expect(phraseIsGrounded('30 people', text)).toBe(true);
    expect(phraseIsGrounded('₹50 for others', text)).toBe(true);
    expect(phraseIsGrounded('6pm-8pm', text)).toBe(true);
  });
  it('rejects facts the user never said', () => {
    expect(phraseIsGrounded('Main Auditorium', text)).toBe(false);
    expect(phraseIsGrounded('100 people', text)).toBe(false);
    expect(phraseIsGrounded('', text)).toBe(false);
  });
  it('an ungrounded "user" value or a "generated" fact is dropped, so the field stays missing', () => {
    const out = run(
      [op('venue', 'set', { text: 'Main Auditorium', phrase: 'Main Auditorium' }), op('capacity', 'set', { number: 100, source: 'generated', phrase: 'guess' }), op('title', 'set', { text: 'Golden Hour Photo Walk', source: 'generated', phrase: 'photo walk' })],
      { text },
    );
    expect(out.draft.venue).toBeUndefined();
    expect(out.draft.capacity).toBeUndefined();
    expect(out.draft.title).toBe('Golden Hour Photo Walk');
    expect(out.sources.title).toBe('generated');
  });
});

describe('dates and times', () => {
  it('"tomorrow 6 pm to 8 pm" resolves both ends in IST and explains how it was read', () => {
    const out = run([op('start', 'set', { date: '2026-10-12', time: '18:00', phrase: 'tomorrow 6pm' }), op('end', 'set', { time: '20:00', phrase: '8pm' })]);
    expect(out.draft).toMatchObject({ startsAt: ist('2026-10-12', '18:00'), endsAt: ist('2026-10-12', '20:00') });
    expect(out.interpretation[0]).toEqual({ field: 'startsAt', phrase: 'tomorrow 6pm', resolved: 'Mon, 12 Oct 2026, 6:00 pm IST' });
    expect(out.problems).toEqual([]);
  });

  it('yesterday, or earlier today, is refused and not applied', () => {
    const y = run([op('start', 'set', { date: '2026-10-10', time: '18:00', phrase: 'yesterday 6pm' })]);
    expect(y.draft.startsAt).toBeUndefined();
    expect(y.problems[0].message).toMatch(/^Sat, 10 Oct 2026, 6:00 pm IST is in the past/);
    expect(run([op('start', 'set', { date: '2026-10-11', time: '10:00' })]).problems[0].message).toMatch(/in the past/);
    expect(run([op('start', 'set', { date: '2026-10-11', time: '13:00' })]).draft.startsAt).toBe(ist('2026-10-11', '13:00'));
  });

  it('a date without a time waits for the time; the next turn completes it', () => {
    const first = run([op('start', 'set', { date: '2026-10-12', phrase: 'tomorrow' })]);
    expect(first.draft.startsAt).toBeUndefined();
    expect(first.partials).toEqual({ start: { date: '2026-10-12' } });
    const q = buildQuestions({ mode: 'create', draft: first.draft, partials: first.partials, now: NOW, timeZone: TZ });
    expect(q[0]).toMatchObject({ field: 'startsAt', text: 'What time does it start on Mon, 12 Oct 2026?' });
    const second = run([op('start', 'set', { time: '18:30', phrase: '6:30' })], { partials: first.partials });
    expect(second.draft.startsAt).toBe(ist('2026-10-12', '18:30'));
    expect(second.partials).toEqual({});
  });

  it('impossible dates and bad times become questions', () => {
    expect(run([op('start', 'set', { date: '2026-02-30', time: '10:00' })]).problems[0].message).toMatch(/2026-02-30 isn't a real date/);
    expect(run([op('start', 'set', { date: '2026-10-20', time: '7' })]).problems[0].message).toBe('What time should the start be?');
  });

  it('"6 pm to 2 am" ends the next day; a duration sets the end from the start', () => {
    const late = run([op('start', 'set', { date: '2026-10-20', time: '18:00' }), op('end', 'set', { time: '02:00', phrase: '2am' })]);
    expect(late.draft.endsAt).toBe(ist('2026-10-21', '02:00'));
    expect(late.interpretation[1].resolved).toMatch(/\(the next day\)$/);
    const dur = run([op('start', 'set', { date: '2026-10-20', time: '18:00' }), op('durationMinutes', 'set', { minutes: 150, phrase: '2.5 hours' })]);
    expect(dur.draft.endsAt).toBe(ist('2026-10-20', '20:30'));
  });

  it('a duration given before the start is kept until the start is known', () => {
    const first = run([op('durationMinutes', 'set', { minutes: 120, phrase: '2 hours' })]);
    expect(first.partials.durationMinutes).toEqual({ minutes: 120, phrase: '2 hours' });
    const q = buildQuestions({ mode: 'create', draft: first.draft, partials: first.partials, now: NOW, timeZone: TZ });
    expect(q.map((x) => x.field)).not.toContain('endsAt'); // only the start is asked for
    const second = run([op('start', 'set', { date: '2026-10-20', time: '10:00' })], { partials: first.partials });
    expect(second.draft.endsAt).toBe(ist('2026-10-20', '12:00'));
  });
});

describe('edits: set, adjust, scale, shift, clear', () => {
  const saved = {
    title: 'Gala', venue: 'Hall', capacity: 50, seatsReserved: 10,
    startsAt: ist('2026-11-01', '18:00'), endsAt: ist('2026-11-01', '21:00'),
    registrationOpensAt: ist('2026-10-01', '09:00'), registrationClosesAt: ist('2026-11-01', '17:00'),
    memberPricePaise: '10000', nonMemberPricePaise: '15000',
    earlyBirdMemberPricePaise: '8000', earlyBirdNonMemberPricePaise: '12000', earlyBirdEndsAt: ist('2026-10-20', '23:59'), earlyBirdQuantity: 20,
  };
  it('price set / adjust / scale, capacity bounds', () => {
    expect(run([op('nonMemberPrice', 'set', { number: 120 })], { base: saved }).draft.nonMemberPricePaise).toBe(12000);
    expect(run([op('memberPrice', 'adjust', { number: 20 })], { base: saved }).draft.memberPricePaise).toBe(12000);
    expect(run([op('capacity', 'scale', { number: 2 })], { base: saved }).draft.capacity).toBe(100);
    expect(run([op('capacity', 'set', { number: 0 })], { base: saved }).problems[0].message).toMatch(/whole number between 1/);
    expect(run([op('memberPrice', 'adjust', { number: -500 })], { base: saved }).problems[0].message).toMatch(/between ₹0/);
    expect(run([op('memberPrice', 'adjust', { number: 20 })]).problems[0].message).toMatch(/no member price yet/);
  });
  it('moving the event keeps times consistent; moving into the past is refused', () => {
    const moved = run([op('start', 'shift', { minutes: 60 }), op('end', 'shift', { minutes: 60 })], { base: saved });
    expect(moved.draft).toMatchObject({ startsAt: ist('2026-11-01', '19:00'), endsAt: ist('2026-11-01', '22:00') });
    expect(run([op('start', 'shift', { minutes: -60 * 24 * 30 })], { base: saved }).problems[0].message).toMatch(/in the past/);
    // "same time on Saturday": a date-only set keeps the saved time
    expect(run([op('start', 'set', { date: '2026-10-31' })], { base: saved }).draft.startsAt).toBe(ist('2026-10-31', '18:00'));
  });
  it('members only clears the non-member early bird too; "remove early bird" clears all four', () => {
    const mo = run([op('nonMemberPrice', 'clear')], { base: saved });
    expect(mo.draft).toMatchObject({ nonMemberPricePaise: null, earlyBirdNonMemberPricePaise: null });
    const eb = run([op('earlyBird', 'clear')], { base: saved });
    expect(eb.draft).toMatchObject({ earlyBirdMemberPricePaise: null, earlyBirdNonMemberPricePaise: null, earlyBirdEndsAt: null, earlyBirdQuantity: null });
    expect(run([op('venue', 'clear')], { base: saved }).problems[0].message).toMatch(/required and can't be removed/);
  });
  it('organizers may change only description and venue', () => {
    const out = run([op('memberPrice', 'set', { number: 1 }), op('venue', 'set', { text: 'Hall 2' })], { base: saved, role: 'ORGANIZER' });
    expect(out.draft.memberPricePaise).toBe('10000');
    expect(out.draft.venue).toBe('Hall 2');
    expect(out.problems[0].message).toMatch(/Only the club head can change the member price/);
  });
  it('before → after and booking warnings', () => {
    const after = { ...saved, startsAt: ist('2026-11-02', '18:00'), nonMemberPricePaise: null };
    expect(describeChanges(saved, after, ['startsAt', 'nonMemberPricePaise'], TZ)).toEqual([
      { field: 'startsAt', label: 'Start', before: 'Sun, 1 Nov 2026, 6:00 pm IST', after: 'Mon, 2 Nov 2026, 6:00 pm IST' },
      { field: 'nonMemberPricePaise', label: 'Non-member price', before: '₹150', after: 'Members only' },
    ]);
    const w = changeWarnings({ event: saved, after, changed: ['startsAt', 'nonMemberPricePaise'], nonMemberBookings: 3 });
    expect(w).toHaveLength(3);
    expect(w[0]).toMatch(/^10 people already have a ticket/);
    expect(w[2]).toMatch(/^3 non-member bookings stay valid/);
    expect(changeWarnings({ event: { ...saved, seatsReserved: 0 }, after, changed: ['startsAt'] })).toEqual([]);
  });
});

describe('questions', () => {
  const start = ist('2026-10-20', '18:00');
  it('asks only for what is missing, most important first, at most four', () => {
    const q = buildQuestions({ mode: 'create', draft: {}, now: NOW, timeZone: TZ });
    expect(q.map((x) => x.field)).toEqual(['startsAt', 'endsAt', 'venue', 'capacity']);
  });
  it('non-member decision offers one-click answers; registration window is suggested, never assumed', () => {
    const draft = { title: 'Walk', venue: 'Lake', startsAt: start, endsAt: ist('2026-10-20', '20:00'), capacity: 30, memberPricePaise: 0 };
    const q = buildQuestions({ mode: 'create', draft, now: NOW, timeZone: TZ });
    expect(q.map((x) => x.field)).toEqual(['nonMemberPricePaise', 'registrationWindow']);
    expect(q[0].suggestions.map((s) => s.label)).toEqual(['Members only', 'Same as members (Free)']);
    expect(q[1].suggestion.patch).toEqual({ registrationOpensAt: '2026-10-11T06:30:00.000Z', registrationClosesAt: ist('2026-10-20', '17:00') });
    expect(q[1].text).toMatch(/opens now \(Sun, 11 Oct 2026, 12:00 pm IST\) and closes 1 hour before the start/);
  });
  it('registration suggestion closes at the start when the event is under an hour away', () => {
    const soon = ist('2026-10-11', '12:40');
    expect(registrationSuggestion({ startsAt: soon }, NOW, TZ).patch.registrationClosesAt).toBe(soon);
  });
  it('rule errors become questions, with a one-click fix when there is an obvious one', () => {
    const q = buildQuestions({ mode: 'edit', draft: { startsAt: start, registrationOpensAt: ist('2026-10-01', '09:00') }, ruleErrors: { registrationClosesAt: 'Registration must close before the event starts.' }, now: NOW, timeZone: TZ });
    expect(q[0]).toMatchObject({ field: 'registrationClosesAt', text: 'Registration closes: Registration must close before the event starts.' });
    expect(q[0].suggestion.patch).toEqual({ registrationClosesAt: ist('2026-10-20', '17:00') });
  });
  it('model ambiguities come first and are length-capped', () => {
    const q = buildQuestions({ mode: 'create', draft: {}, ambiguities: [{ field: 'start', question: 'Which Friday — this week or next?', options: ['Fri, 16 Oct 2026', 'Fri, 23 Oct 2026'] }], now: NOW, timeZone: TZ });
    expect(q[0]).toEqual({ id: 'ambiguous:start', field: 'startsAt', text: 'Which Friday — this week or next?', options: ['Fri, 16 Oct 2026', 'Fri, 23 Oct 2026'] });
    expect(q).toHaveLength(4);
  });
});
