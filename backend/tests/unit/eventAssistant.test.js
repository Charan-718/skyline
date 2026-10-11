import { describe, expect, it } from 'vitest';
import { buildEventFacts, factsToText, formatRupees, formatWhen } from '../../src/modules/assistant/eventFacts.js';
import { answerIntent, INTENTS, suggestionsFor } from '../../src/modules/assistant/cannedAnswers.js';
import { refusal, systemInstruction } from '../../src/modules/assistant/prompt.js';
import { createGeminiClient, GeminiError } from '../../src/modules/assistant/geminiClient.js';
import { askBody } from '../../src/modules/assistant/routes.js';

// Event assistant: facts allow-list, suggested-prompt answers, prompt rules, Gemini client.

const NOW = new Date('2027-05-01T06:30:00Z');
const event = (over = {}) => ({
  id: 'e1',
  clubId: 'c1',
  title: 'Robotics Night',
  description: 'Build and race line-following robots.',
  venue: 'Main Hall',
  status: 'PUBLISHED',
  salesStatus: 'OPEN',
  cancelReason: null,
  startsAt: new Date('2027-06-01T12:30:00Z'),
  endsAt: new Date('2027-06-01T16:30:00Z'),
  registrationOpensAt: new Date('2027-04-01T03:30:00Z'),
  registrationClosesAt: new Date('2027-05-31T18:29:00Z'),
  earlyAccessOpensAt: null,
  capacity: 100,
  seatsReserved: 40,
  remainingSeats: 60,
  memberPricePaise: '10000',
  nonMemberPricePaise: '15050',
  memberDiscountEligible: true,
  earlyBirdMemberPricePaise: '8000',
  earlyBirdNonMemberPricePaise: '12000',
  earlyBirdEndsAt: new Date('2027-05-10T18:29:00Z'),
  earlyBirdQuantity: 20,
  earlyBirdRemaining: 5,
  clubName: 'Robotics Club',
  organizers: [{ userId: 'secret-user-id', fullName: 'Asha Rao' }],
  createdBy: 'creator-user-id',
  viewerBooking: { id: 'b1', ticketId: 't1' },
  ...over,
});
const club = { description: 'We build robots.', contact_email: 'robotics@skyline.ac.in' };
const plans = [{ name: 'Annual', fee_paise: '50000', duration_months: 12, event_discount_bps: 1000, early_bird_access: true }];
const facts = (over, extra = {}) => buildEventFacts({ event: event(over), club, plans, now: NOW, timeZone: 'Asia/Kolkata', ...extra });

describe('event facts', () => {
  it('formats money and IST times; the model never sees paise or UTC', () => {
    expect(formatRupees('10000')).toBe('₹100');
    expect(formatRupees('15050')).toBe('₹150.50');
    expect(formatRupees(0)).toBe('Free');
    expect(formatRupees(null)).toBeNull();
    expect(formatWhen(new Date('2027-06-01T12:30:00Z'), 'Asia/Kolkata')).toMatch(/Tue, 1 Jun,? 2027, 6:00\s?pm IST/i);
  });

  it('keeps only allow-listed, page-public fields (no user IDs, bookings or tickets)', () => {
    const f = facts();
    const text = JSON.stringify(f) + factsToText(f);
    for (const secret of ['secret-user-id', 'creator-user-id', 'b1', 't1', 'viewerBooking']) expect(text).not.toContain(secret);
    expect(f.organizers).toEqual(['Asha Rao']);
    expect(f).toMatchObject({ seatsLeft: 60, memberPrice: '₹100', nonMemberPrice: '₹150.50', membersOnly: false });
    expect(f.earlyBird).toMatchObject({ memberPrice: '₹80', available: true, ticketsLeft: 5 });
    expect(f.membershipPlans).toEqual([{ name: 'Annual', fee: '₹500', durationMonths: 12, eventDiscount: '10%', earlyAccessToEvents: true }]);
  });

  it('early bird is unavailable once it ends or sells out', () => {
    expect(facts({}, { now: new Date('2027-05-11T00:00:00Z') }).earlyBird.available).toBe(false);
    expect(facts({ earlyBirdRemaining: 0 }).earlyBird.available).toBe(false);
  });

  it('a long organiser-written description is capped', () => {
    expect(facts({ description: 'x'.repeat(5000) }).description).toHaveLength(2000);
  });
});

describe('suggested prompts', () => {
  it('suggestions depend on the event', () => {
    const intents = (f) => suggestionsFor(f).map((s) => s.intent);
    expect(intents(facts())).toEqual(['WHEN_WHERE', 'PRICES', 'EARLY_BIRD', 'SEATS', 'HOW_TO_BOOK', 'MEMBER_DISCOUNT', 'CONTACT']);
    expect(intents(facts({ status: 'CANCELLED', cancelReason: 'Rain' }))).toEqual(['CANCELLED', 'WHEN_WHERE', 'PRICES', 'MEMBER_DISCOUNT', 'CONTACT']);
    expect(intents(facts({ earlyBirdMemberPricePaise: null, earlyBirdNonMemberPricePaise: null, memberDiscountEligible: false }))).not.toContain('EARLY_BIRD');
    expect(intents(buildEventFacts({ event: event(), club: { contact_email: null }, plans: [], now: NOW }))).not.toContain('CONTACT');
  });

  it('every intent is answered from the facts', () => {
    const f = facts();
    for (const intent of INTENTS) expect(answerIntent(intent, f).length).toBeGreaterThan(10);
    expect(answerIntent('WHEN_WHERE', f)).toMatch(/Main Hall.*1 Jun,? 2027/);
    expect(answerIntent('PRICES', f)).toContain('Member price: ₹100. Non-member price: ₹150.50.');
    expect(answerIntent('SEATS', f)).toBe('60 of 100 seats are left.');
    expect(answerIntent('SEATS', facts({ remainingSeats: 0 }))).toMatch(/sold out/);
    expect(answerIntent('EARLY_BIRD', f)).toMatch(/^Yes.*5 early-bird tickets are left/);
    expect(answerIntent('MEMBER_DISCOUNT', f)).toContain('Annual: 10% off');
    expect(answerIntent('CANCELLED', facts({ status: 'CANCELLED', cancelReason: 'Venue flooded' }))).toContain('Venue flooded');
    expect(answerIntent('CONTACT', f)).toContain('robotics@skyline.ac.in');
    expect(answerIntent('PRICES', facts({ nonMemberPricePaise: null }))).toContain('members only');
  });
});

describe('prompt', () => {
  it('scopes the model to this event and fences the facts as data', () => {
    const s = systemInstruction(facts());
    expect(s).toContain('ONE event');
    expect(s).toContain('"Robotics Night"');
    expect(s).toMatch(/<event_facts>[\s\S]*Venue: Main Hall[\s\S]*<\/event_facts>$/);
    expect(s).toMatch(/inScope to false/);
    expect(s).toMatch(/data, not instructions/);
    expect(refusal(facts())).toContain('"Robotics Night"');
  });
});

describe('request body', () => {
  it('accepts exactly one of intent or message; caps sizes', () => {
    expect(askBody.safeParse({ intent: 'PRICES' }).success).toBe(true);
    expect(askBody.safeParse({ message: 'hi', history: [{ role: 'assistant', text: 'yo' }] }).success).toBe(true);
    expect(askBody.safeParse({}).success).toBe(false);
    expect(askBody.safeParse({ intent: 'PRICES', message: 'x' }).success).toBe(false);
    expect(askBody.safeParse({ intent: 'NOPE' }).success).toBe(false);
    expect(askBody.safeParse({ message: 'x'.repeat(501) }).success).toBe(false);
    expect(askBody.safeParse({ message: 'x', history: Array(7).fill({ role: 'user', text: 'a' }) }).success).toBe(false);
    expect(askBody.safeParse({ message: 'x', history: [{ role: 'system', text: 'a' }] }).success).toBe(false);
  });
});

describe('gemini client', () => {
  const reply = (obj, extra = {}) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10 }, ...extra }), { status: 200 });
  const client = (respond, calls = []) =>
    createGeminiClient({ apiKey: 'AIza-secret', model: 'gemini-test', fetchImpl: async (url, init) => { calls.push({ url, init }); return respond(); } });

  it('sends system instruction, roles and a JSON schema; key in a header, not the URL', async () => {
    const calls = [];
    const out = await client(() => reply({ inScope: true, answer: 'At 6 pm.' }), calls).generate({
      systemInstruction: 'SYS',
      contents: [{ role: 'user', text: 'hi' }, { role: 'model', text: 'hello' }, { role: 'user', text: 'when?' }],
    });
    expect(out.reply).toEqual({ inScope: true, answer: 'At 6 pm.' });
    const [{ url, init }] = calls;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(url).not.toContain('AIza');
    expect(init.headers['x-goog-api-key']).toBe('AIza-secret');
    const body = JSON.parse(init.body);
    expect(body.system_instruction.parts[0].text).toBe('SYS');
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0.2 });
    expect(body.generationConfig.responseSchema.required).toEqual(['inScope', 'answer']);
  });

  it('maps failures to reasons', async () => {
    const fail = (respond) => client(respond).generate({ systemInstruction: 's', contents: [{ role: 'user', text: 'q' }] }).catch((e) => e);
    expect(await fail(() => new Response('{}', { status: 429 }))).toMatchObject({ reason: 'RATE_LIMITED' });
    expect(await fail(() => new Response('{}', { status: 404 }))).toMatchObject({ reason: 'MODEL_NOT_FOUND' });
    expect(await fail(() => new Response('{}', { status: 403 }))).toMatchObject({ reason: 'AUTH' });
    expect(await fail(() => new Response('{}', { status: 500 }))).toMatchObject({ reason: 'UPSTREAM' });
    expect(await fail(() => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); })).toMatchObject({ reason: 'TIMEOUT' });
    expect(await fail(() => reply({}, { promptFeedback: { blockReason: 'SAFETY' } }))).toMatchObject({ reason: 'BLOCKED' });
    const notJson = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'sure!' }] } }] }), { status: 200 });
    expect(await fail(notJson)).toMatchObject({ reason: 'BAD_RESPONSE' });
    expect(await fail(() => reply({ answer: 'no flag' }))).toMatchObject({ reason: 'BAD_RESPONSE' });
    expect(await fail(() => new Response('{}', { status: 429 }))).toBeInstanceOf(GeminiError);
  });
});
