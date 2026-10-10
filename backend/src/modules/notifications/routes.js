import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { paginationQuery } from '../../shared/pagination.js';

// GET /dev/outbox (dev tools only, AUTH; LLD §4.6, §4.11): rendered messages and delivery state.

const outboxQuery = z.object({ channel: z.enum(['EMAIL']).optional(), ...paginationQuery }).strict();

export function createNotificationDevRoutes({ controller, requireAuth }) {
  const r = Router();
  r.get('/dev/outbox', requireAuth, validate({ query: outboxQuery }), controller.outbox);
  return r;
}
