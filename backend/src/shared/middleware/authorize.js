import { AppError } from '../errors.js';

/**
 * @param {ReturnType<import('../../modules/clubs/authz.js').createClubAuthz>} authz
 * @param {object} spec
 * @param {'AUTH'|'CH'|'TR'|'VOL'|'TEAM'|'ORG'|'STAFF'|'OWNER'} spec.role
 * @param {(req: import('express').Request) => Promise<{ clubId?: string, eventId?: string, ownerUserId?: string }>} spec.resolveScope
 */
export function authorize(authz, spec) {
  return async (req, _res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
      }
      const scope = await spec.resolveScope(req);
      const caps = await authz.getCapabilities(userId);

      if (spec.role === 'OWNER') {
        if (scope.ownerUserId !== userId) {
          return next(new AppError('FORBIDDEN', 403, 'Forbidden'));
        }
        return next();
      }

      const { clubId, eventId } = scope;
      const allowed = await authz.checkRole(userId, spec.role, { clubId, eventId, caps });
      if (!allowed) {
        return next(new AppError('FORBIDDEN', 403, 'Forbidden'));
      }
      req.capabilities = caps;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
