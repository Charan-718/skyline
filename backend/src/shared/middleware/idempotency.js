import crypto from 'node:crypto';
import { AppError } from '../errors.js';
import { db } from '../../db/knex.js';

function hashRequest(req) {
  const body = req.body ? JSON.stringify(req.body) : '';
  return crypto.createHash('sha256').update(`${req.method}:${req.path}:${body}`).digest('hex');
}

export function requireIdempotencyKey(req, _res, next) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') {
    return next(new AppError('IDEMPOTENCY_KEY_REQUIRED', 400, 'Idempotency-Key header is required'));
  }
  req.idempotencyKey = key;
  next();
}

export function idempotencyMiddleware() {
  return async (req, res, next) => {
    if (!req.idempotencyKey || !req.userId) return next();

    const requestHash = hashRequest(req);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const existing = await db('idempotency_keys')
      .where({ user_id: req.userId, key: req.idempotencyKey })
      .first();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        return next(new AppError('IDEMPOTENCY_KEY_REUSED', 409, 'Idempotency key reused with different body'));
      }
      if (existing.status_code == null) {
        return next(new AppError('REQUEST_IN_PROGRESS', 409, 'Request in progress'));
      }
      res.status(existing.status_code);
      return res.json(existing.response_body);
    }

    await db('idempotency_keys').insert({
      user_id: req.userId,
      key: req.idempotencyKey,
      method: req.method,
      path: req.path,
      request_hash: requestHash,
      locked_at: db.fn.now(),
      expires_at: expiresAt,
    });

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      db('idempotency_keys')
        .where({ user_id: req.userId, key: req.idempotencyKey })
        .update({ status_code: res.statusCode, response_body: body })
        .catch(() => {});
      return originalJson(body);
    };

    next();
  };
}
