import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { clubIdParam, eventIdParam } from '../events/schemas.js';
import { createTurnBody, editTurnBody } from './schema.js';

// GET  /event-agent                       -> { available }            (signed in)
// POST /clubs/:clubId/events/agent        create-mode turn            (club head)
// POST /events/:eventId/agent             edit-mode turn              (club head or organizer)
// Turns only read; saving goes through the existing event endpoints after the user confirms.

export function createEventAgentRoutes({ controller, rateLimitPerMin }) {
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: rateLimitPerMin,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `agent:${req.session?.userId}`,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many agent requests. Please wait a minute and try again.' } },
  });
  const r = Router();
  r.get('/event-agent', requireAuth, controller.status);
  r.post('/clubs/:clubId/events/agent', requireAuth, csrfHeader, limiter, validate({ params: clubIdParam, body: createTurnBody }), controller.createTurn);
  r.post('/events/:eventId/agent', requireAuth, csrfHeader, limiter, validate({ params: eventIdParam, body: editTurnBody }), controller.editTurn);
  return r;
}
