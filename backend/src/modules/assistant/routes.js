import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { optionalAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { eventIdParam } from '../events/schemas.js';
import { INTENTS } from './cannedAnswers.js';

// GET  /events/:eventId/assistant  -> { eventTitle, freeText, suggestions }   (anyone who can see the event)
// POST /events/:eventId/assistant  { intent } | { message, history? } -> { answer, inScope, source }
// Free-text questions need a session and are rate limited per user (protects the free Gemini quota).

const historyItem = z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(1500) }).strict();

export const askBody = z
  .object({
    intent: z.enum(INTENTS).optional(),
    message: z.string().trim().min(1).max(500).optional(),
    history: z.array(historyItem).max(6).default([]),
  })
  .strict()
  .refine((b) => Boolean(b.intent) !== Boolean(b.message), { message: 'Send either intent or message.' });

export function createAssistantRoutes({ controller, rateLimitPerMin }) {
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: rateLimitPerMin,
    standardHeaders: true,
    legacyHeaders: false,
    // Suggested prompts cost nothing; only free-text questions count.
    skip: (req) => !req.body?.message,
    keyGenerator: (req) => (req.session?.userId ? `u:${req.session.userId}` : `ip:${ipKeyGenerator(req.ip)}`),
    message: { error: { code: 'RATE_LIMITED', message: 'You are asking too fast. Please wait a minute and try again.' } },
  });

  const r = Router();
  r.get('/events/:eventId/assistant', optionalAuth, validate({ params: eventIdParam }), controller.config);
  r.post('/events/:eventId/assistant', optionalAuth, csrfHeader, limiter, validate({ params: eventIdParam, body: askBody }), controller.ask);
  return r;
}
