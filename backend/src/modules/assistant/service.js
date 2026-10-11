import { AppError } from '../../shared/errors.js';
import { now } from '../../shared/clock.js';
import { buildEventFacts } from './eventFacts.js';
import { answerIntent, labelFor, suggestionsFor } from './cannedAnswers.js';
import { refusal, systemInstruction } from './prompt.js';
import { GeminiError } from './geminiClient.js';

// Event assistant. Every call first loads the event through eventService.getEvent, so the assistant
// sees exactly what the event page shows and a DRAFT/CANCELLED event stays 404 for outsiders.
//   suggested prompt (intent) -> answered from the facts, no AI call, works for everyone
//   free text (message)       -> signed-in users only; Gemini with a strict scope; off-topic ->
//                                a fixed refusal written by the server
// Message text and answers are never logged; only counts, timings and outcomes.

const MAX_ANSWER_CHARS = 1500;
const UNAVAILABLE_MESSAGE = 'The assistant cannot answer free-form questions right now. Please try again in a minute, or use the suggested questions.';

const unavailable = (reason) => new AppError('ASSISTANT_UNAVAILABLE', 503, UNAVAILABLE_MESSAGE, { reason });

export function createAssistantService({ db, eventService, gemini, timeZone, logger }) {
  async function factsFor(eventId, userId) {
    const event = await eventService.getEvent(eventId, userId ?? null);
    const club = await db('clubs').where({ id: event.clubId }).first('description', 'contact_email');
    const plans = await db('membership_plans')
      .where({ club_id: event.clubId, status: 'ACTIVE' })
      .orderBy('fee_paise')
      .select('name', 'fee_paise', 'duration_months', 'event_discount_bps', 'early_bird_access');
    return buildEventFacts({ event, club, plans, now: now(), timeZone });
  }

  async function config(eventId, userId) {
    const facts = await factsFor(eventId, userId);
    return {
      eventTitle: facts.title,
      freeText: { available: Boolean(gemini), requiresSignIn: true, signedIn: Boolean(userId) },
      suggestions: suggestionsFor(facts),
    };
  }

  async function ask(eventId, userId, { intent, message, history = [] }) {
    const facts = await factsFor(eventId, userId);
    if (intent) {
      return { answer: answerIntent(intent, facts), inScope: true, source: 'FACTS', question: labelFor(intent, facts) };
    }
    if (!userId) throw new AppError('UNAUTHENTICATED', 401, 'Sign in to ask your own question.');
    if (!gemini) throw unavailable('NOT_CONFIGURED');

    const contents = [
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', text: h.text })),
      { role: 'user', text: message },
    ];
    const started = Date.now();
    try {
      const { reply, usage } = await gemini.generate({ systemInstruction: systemInstruction(facts), contents });
      const inScope = reply.inScope && reply.answer.trim().length > 0;
      logger.info(
        { eventId, inScope, latencyMs: Date.now() - started, promptTokens: usage?.promptTokenCount ?? null, outputTokens: usage?.candidatesTokenCount ?? null },
        'assistant: answered',
      );
      return { answer: inScope ? reply.answer.trim().slice(0, MAX_ANSWER_CHARS) : refusal(facts), inScope, source: 'AI' };
    } catch (err) {
      if (!(err instanceof GeminiError)) throw err;
      if (err.reason === 'BLOCKED') {
        logger.info({ eventId, latencyMs: Date.now() - started }, 'assistant: blocked by safety filter');
        return { answer: refusal(facts), inScope: false, source: 'AI' };
      }
      const level = ['AUTH', 'MODEL_NOT_FOUND'].includes(err.reason) ? 'error' : 'warn';
      logger[level]({ eventId, reason: err.reason, status: err.status, model: gemini.model }, 'assistant: Gemini call failed');
      throw unavailable(err.reason === 'RATE_LIMITED' ? 'BUSY' : 'UPSTREAM');
    }
  }

  return Object.freeze({ config, ask });
}
