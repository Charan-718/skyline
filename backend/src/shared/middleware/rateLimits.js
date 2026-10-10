import { rateLimit } from 'express-rate-limit';
import { appError } from '../errors.js';

// HLD security table: global 300/min/IP; auth, verification (5/h/user) and check-in (120/min/staff)
// limiters are exported for the modules that own those routes. In-memory store (single instance).

function limiter({ enabled, windowMs, limit, keyGenerator }) {
  if (!enabled) return (req, res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res, next) => next(appError('RATE_LIMITED')),
  });
}

const byUser = (req) => req.actor?.userId ?? req.ip;

export function createRateLimits({ enabled }) {
  return {
    global: limiter({ enabled, windowMs: 60_000, limit: 300 }),
    login: limiter({ enabled, windowMs: 15 * 60_000, limit: 10 }),
    verification: limiter({ enabled, windowMs: 60 * 60_000, limit: 5, keyGenerator: byUser }),
    checkIn: limiter({ enabled, windowMs: 60_000, limit: 120, keyGenerator: byUser }),
  };
}
