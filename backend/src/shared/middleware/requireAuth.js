import { AppError } from '../errors.js';

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) {
    return next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
  }
  req.userId = req.session.userId;
  return next();
}

export function optionalAuth(req, _res, next) {
  if (req.session?.userId) {
    req.userId = req.session.userId;
  }
  return next();
}
