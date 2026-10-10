import { appError } from '../errors.js';

// ADR-004: state-changing requests must carry X-Requested-With: soms (with SameSite=Lax cookies).
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfHeader() {
  return (req, res, next) => {
    if (SAFE.has(req.method) || req.get('X-Requested-With') === 'soms') return next();
    next(appError('FORBIDDEN', { reason: 'CSRF_HEADER_MISSING' }, 'Missing X-Requested-With header.'));
  };
}
