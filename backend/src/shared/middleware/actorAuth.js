import { appError } from '../errors.js';

// Builds req.actor from the session. The user is re-read on every request so deactivation
// takes effect immediately; no role claims are trusted from the client (LLD §2.2).
// auth.getUser is Group 1's (TODO(group1) stub until T-20, OQ-05/OQ-28).

export function createRequireAuth({ auth }) {
  return async function requireAuth(req, res, next) {
    try {
      const userId = req.session?.userId;
      if (!userId) throw appError('UNAUTHENTICATED');
      const user = await auth.getUser(userId);
      if (!user || !user.isActive) {
        await new Promise((resolve) => req.session.destroy(() => resolve()));
        throw appError('UNAUTHENTICATED');
      }
      req.actor = { userId: user.id, fullName: user.fullName };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Public routes with caller-specific extras: sets req.actor when signed in, never rejects. */
export function createOptionalAuth({ auth }) {
  return async function optionalAuth(req, res, next) {
    try {
      const userId = req.session?.userId;
      if (userId) {
        const user = await auth.getUser(userId);
        if (user?.isActive) req.actor = { userId: user.id, fullName: user.fullName };
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
