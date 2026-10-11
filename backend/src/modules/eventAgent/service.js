import { AppError } from '../../shared/errors.js';
import { now as clockNow } from '../../shared/clock.js';
import { createEventBody, updateEventBody } from '../events/schemas.js';
import { changedKeys, checkEventRules } from '../events/domain/eventRules.js';
import { GeminiError } from '../../shared/gemini/client.js';
import { FIELDS, REQUIRED_API } from './fields.js';
import { applyOps } from './ops.js';
import { buildQuestions } from './questions.js';
import { changeWarnings, describeChanges } from './review.js';
import { parseModelReply, RESPONSE_SCHEMA } from './schema.js';
import { systemInstruction } from './prompt.js';

// Event Draft Agent: one conversation turn per call. It never writes to the database — the client
// saves through the normal event endpoints (create / organizers / publish / PATCH), after the user
// confirms, so every existing permission and validation still applies.
//
//   turn = (if the last message is the user's) ask Gemini to extract operations
//        -> apply them with the anti-hallucination rules (ops.js)
//        -> check the event rules shared with manual create/edit
//        -> NEEDS_INFO (with questions) | READY | NO_CHANGES | OUT_OF_SCOPE | NOT_EDITABLE
//
// Messages written to the user come from this file, never from the model, so they can't claim a
// value the server did not accept. Prompts and answers are never logged.

const API_FIELDS = Object.values(FIELDS).map((f) => f.api).filter(Boolean);
const toIso = (v) => (v == null ? v : new Date(v).toISOString());
const toNum = (v) => (v == null ? v : Number(v));

/** Saved event (camelCase, Dates, BIGINT strings) -> API-shaped values. */
function savedValues(event) {
  const out = {};
  for (const k of API_FIELDS) {
    const v = event[k];
    if (/At$/.test(k)) out[k] = toIso(v);
    else if (/PricePaise$/.test(k) || k === 'capacity' || k === 'earlyBirdQuantity') out[k] = toNum(v);
    else out[k] = v;
  }
  out.description = out.description ?? '';
  return out;
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

// Words and patterns that show a message is about planning an event. Used only to refuse a model's
// "out of scope" verdict on a message that clearly is in scope (small models sometimes misjudge).
const EVENT_CUES =
  /\b(event|hackathon|workshop|seminar|meetup|session|talk|fest|festival|party|walk|tour|trip|quiz|contest|competition|match|tournament|concert|show|screening|webinar|class|lecture|camp|drive|launch|ceremony|night|venue|hall|auditorium|register|registration|seats?|capacity|participants?|attendees?|people|members?|price|fee|free|rupees?|rs\.?|tickets?|starts?|ends?|tomorrow|today|tonight|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|days?|hours?|am|pm)\b|₹|\d/i;
export const looksLikeEventDetails = (text) => (String(text ?? '').match(new RegExp(EVENT_CUES.source, 'gi')) ?? []).length >= 3;

const MESSAGES = {
  OUT_OF_SCOPE: 'I can only help with the details of this event — dates, venue, capacity, prices, early bird or the description.',
  MULTIPLE_EVENTS: "Let's set up one event at a time. Which one should we start with?",
  CANCEL_OR_DELETE: "I can't cancel or delete events. Use the Cancel event button on the event page — it also handles tickets and bookings.",
  NOT_EDITABLE: 'This event is cancelled or completed, so it can no longer be edited.',
  CREATE_READY: 'Everything is in place. Check the details, then save it as a draft or publish it.',
  CREATE_NEEDS: 'Thanks — I need a few more details before this can be saved.',
  EDIT_READY: 'Here is what will change. Check it, then apply.',
  EDIT_NEEDS: 'I need a little more information before I can make this change.',
  NO_CHANGES: "I didn't find anything to change. What would you like to update?",
};

/**
 * clients: ordered model clients ({ model, generateJson }) tried in turn; `gemini` (single client) is
 * accepted too (tests). Each client may be Gemini or OpenRouter — the interface is the same.
 */
export function createEventAgentService({ db, eventService, authz, clients, gemini, timeZone, logger }) {
  const chain = clients ?? [gemini].filter(Boolean);
  function requireAvailable() {
    if (!chain.length) throw new AppError('AGENT_UNAVAILABLE', 503, 'The event agent is not configured.', { reason: 'NOT_CONFIGURED' });
  }

  /**
   * Asks the model chain for operations, unless the last message is not the user's (re-check after a
   * one-click suggestion). Each client is tried once, in order, until one gives a usable reply: a
   * timeout, server error, rate limit, auth problem or unusable reply moves on to the next (often a
   * different provider). A reply is validated item by item, so one malformed operation never sinks
   * the whole turn.
   */
  async function extract({ messages, mode, ctx }) {
    if (messages.at(-1).role !== 'user') return { intent: 'EVENT_DETAILS', ops: [], ambiguities: [], publishRequested: false };
    const request = {
      systemInstruction: systemInstruction({ mode, timeZone, ...ctx }),
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', text: m.text })),
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 8192,
    };
    const lastUserText = messages.filter((m) => m.role === 'user').at(-1)?.text ?? '';
    let lastError = null;
    let reminded = false;
    let outOfScopeReply = null; // kept in case every second opinion fails
    for (let i = 0; i < chain.length; i += 1) {
      const client = chain[i];
      const started = Date.now();
      try {
        const { json, usage } = await client.generateJson(request);
        const parsed = parseModelReply(json);
        if (!parsed) throw new GeminiError('BAD_RESPONSE', 200, { shape: Array.isArray(json) ? 'array' : typeof json });
        if (parsed.dropped.length) logger.warn({ mode, model: client.model, dropped: parsed.dropped }, 'event-agent: ignored malformed items in the reply');
        // Second opinion: an "out of scope" verdict on a message that clearly describes an event is
        // not accepted. Ask the next model; if none is left, ask this one again with a reminder.
        if (parsed.reply.intent === 'OUT_OF_SCOPE' && looksLikeEventDetails(lastUserText) && !reminded) {
          logger.warn({ mode, model: client.model }, 'event-agent: out-of-scope verdict on an event-like message; asking again');
          outOfScopeReply = parsed.reply;
          if (i === chain.length - 1) {
            reminded = true;
            request.contents = [...request.contents.slice(0, -1), { role: 'user', text: `${lastUserText}\n\n(This message describes ${mode === 'create' ? 'an event to create' : 'a change to this event'}. Extract its details; intent is EVENT_DETAILS.)` }];
            i -= 1;
          }
          continue;
        }
        logger.info({ mode, model: client.model, attempt: i + 1, intent: parsed.reply.intent, ops: parsed.reply.ops.length, latencyMs: Date.now() - started, tokens: usage?.totalTokenCount ?? null }, 'event-agent: extracted');
        return parsed.reply;
      } catch (err) {
        if (!(err instanceof GeminiError)) throw err;
        if (err.reason === 'BLOCKED') return { intent: 'OUT_OF_SCOPE', ops: [], ambiguities: [], publishRequested: false };
        lastError = err;
        const more = i < chain.length - 1;
        const level = ['AUTH', 'MODEL_NOT_FOUND'].includes(err.reason) ? 'error' : 'warn';
        logger[level]({ mode, model: client.model, reason: err.reason, status: err.status, detail: err.detail, latencyMs: Date.now() - started }, more ? 'event-agent: falling back to the next model' : 'event-agent: Gemini call failed');
        if (!more) break;
      }
    }
    if (outOfScopeReply) return outOfScopeReply;
    throw new AppError('AGENT_UNAVAILABLE', 503, 'The event agent is busy or unavailable right now. Please try again, or continue manually.', {
      reason: lastError?.reason === 'RATE_LIMITED' ? 'BUSY' : 'UPSTREAM',
    });
  }

  const userTextOf = (messages) => messages.filter((m) => m.role === 'user').map((m) => m.text).join('\n');

  async function createTurn(actor, clubId, body) {
    await authz.requireClubHead(actor.userId, clubId);
    requireAvailable();
    const club = await db('clubs').where({ id: clubId }).first('name');
    const at = clockNow();
    const reply = await extract({
      messages: body.messages,
      mode: 'create',
      ctx: { now: at, clubName: club?.name, values: body.draft, partials: body.partials },
    });
    const base = { draft: body.draft, sources: body.sources, partials: body.partials };
    if (reply.intent !== 'EVENT_DETAILS') {
      return { status: reply.intent === 'MULTIPLE_EVENTS' ? 'NEEDS_INFO' : 'OUT_OF_SCOPE', ...base, questions: [], interpretation: [], publishRequested: false, message: MESSAGES[reply.intent] };
    }

    const out = applyOps({ base: body.draft, partials: body.partials, ops: reply.ops, role: 'CLUB_HEAD', now: at, timeZone, userText: userTextOf(body.messages) });
    const draft = out.draft;
    const sources = { ...body.sources, ...out.sources };
    if (draft.memberDiscountEligible === undefined) {
      draft.memberDiscountEligible = true;
      sources.memberDiscountEligible = 'default';
    }
    const ruleErrors = checkEventRules(draft, { now: at, mode: 'create' });
    const questions = buildQuestions({ mode: 'create', draft, partials: out.partials, problems: out.problems, ambiguities: reply.ambiguities, ruleErrors, now: at, timeZone });
    const complete = REQUIRED_API.every((k) => draft[k] !== undefined && (k === 'nonMemberPricePaise' || draft[k] !== null));
    const ready = complete && questions.length === 0 && Object.keys(out.partials).length === 0 && createEventBody.safeParse(draft).success;

    logger.info({ clubId, status: ready ? 'READY' : 'NEEDS_INFO', questions: questions.map((q) => q.field) }, 'event-agent: create turn');
    return {
      status: ready ? 'READY' : 'NEEDS_INFO',
      draft,
      sources,
      partials: out.partials,
      questions,
      interpretation: out.interpretation,
      publishRequested: reply.publishRequested,
      message: ready ? MESSAGES.CREATE_READY : MESSAGES.CREATE_NEEDS,
    };
  }

  async function editTurn(actor, eventId, body) {
    const event = await eventService.getEvent(eventId, actor.userId);
    if (!event.viewerCanManage) throw new AppError('NOT_FOUND', 404, 'Event not found');
    const role = event.viewerIsClubHead ? 'CLUB_HEAD' : 'ORGANIZER';
    const saved = savedValues(event);
    const common = { eventStatus: event.status, needsOrganizer: (event.organizers ?? []).length === 0 };
    if (['CANCELLED', 'COMPLETED'].includes(event.status)) {
      return { status: 'NOT_EDITABLE', patch: {}, sources: {}, partials: {}, questions: [], interpretation: [], changes: [], warnings: [], publishRequested: false, ...common, message: MESSAGES.NOT_EDITABLE };
    }
    requireAvailable();
    const at = clockNow();
    const current = { ...saved, ...body.patch };
    const reply = await extract({
      messages: body.messages,
      mode: 'edit',
      ctx: { now: at, clubName: event.clubName, values: current, partials: body.partials, role, eventStatus: event.status, seatsReserved: event.seatsReserved ?? 0 },
    });
    if (reply.intent !== 'EVENT_DETAILS') {
      return {
        status: reply.intent === 'MULTIPLE_EVENTS' ? 'NEEDS_INFO' : 'OUT_OF_SCOPE',
        patch: body.patch,
        sources: body.sources,
        partials: body.partials,
        questions: [],
        interpretation: [],
        changes: describeChanges(saved, current, changedKeys(saved, pick(current, API_FIELDS)), timeZone),
        warnings: [],
        publishRequested: false,
        ...common,
        message: MESSAGES[reply.intent],
      };
    }

    const out = applyOps({ base: current, partials: body.partials, ops: reply.ops, role, now: at, timeZone, userText: userTextOf(body.messages) });
    const after = out.draft;
    const changed = changedKeys(saved, pick(after, API_FIELDS));
    const patch = pick(after, changed);
    const ruleErrors = checkEventRules(after, { now: at, mode: 'update', changed, seatsReserved: event.seatsReserved ?? 0, earlyBirdReserved: event.earlyBirdReserved ?? 0 });
    const questions = buildQuestions({ mode: 'edit', draft: after, partials: out.partials, problems: out.problems, ambiguities: reply.ambiguities, ruleErrors, now: at, timeZone });

    let nonMemberBookings = 0;
    if (changed.includes('nonMemberPricePaise') && after.nonMemberPricePaise === null) {
      const row = await db('bookings').where({ event_id: eventId, buyer_type: 'NON_MEMBER' }).whereIn('status', ['CONFIRMED', 'PENDING_PAYMENT']).count('* as c').first();
      nonMemberBookings = Number(row?.c ?? 0);
    }
    const publishRequested = reply.publishRequested && event.status === 'DRAFT' && role === 'CLUB_HEAD';
    const valid = updateEventBody.safeParse(patch).success;
    let status;
    if (questions.length || Object.keys(out.partials).length || !valid) status = 'NEEDS_INFO';
    else if (changed.length) status = 'READY';
    else status = publishRequested ? 'READY' : 'NO_CHANGES';

    const sources = { ...pick(body.sources, Object.keys(body.sources).filter((k) => changed.includes(k))), ...pick(out.sources, Object.keys(out.sources).filter((k) => changed.includes(k))) };
    logger.info({ eventId, status, changed, questions: questions.map((q) => q.field) }, 'event-agent: edit turn');
    return {
      status,
      patch,
      sources,
      partials: out.partials,
      questions,
      interpretation: out.interpretation,
      changes: describeChanges(saved, after, changed, timeZone),
      warnings: changeWarnings({ event, after, changed, nonMemberBookings }),
      publishRequested,
      ...common,
      message: status === 'READY' ? (changed.length ? MESSAGES.EDIT_READY : 'Ready to publish. Check the event, then publish.') : status === 'NO_CHANGES' ? MESSAGES.NO_CHANGES : MESSAGES.EDIT_NEEDS,
    };
  }

  return Object.freeze({ available: () => chain.length > 0, createTurn, editTurn });
}
