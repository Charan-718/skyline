import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { clubIdParam, assignmentIdParam, assignRoleBody, listClubsQuery } from './schemas.js';

export function createClubRoutes({ clubController, authz }) {
  const router = Router();

  router.get('/clubs', validate({ query: listClubsQuery }), clubController.list);
  router.get('/clubs/:clubId', validate({ params: clubIdParam }), clubController.get);

  router.get(
    '/clubs/:clubId/roles',
    requireAuth,
    validate({ params: clubIdParam }),
    authorize(authz, { role: 'CH', resolveScope: async (req) => ({ clubId: req.params.clubId }) }),
    clubController.listRoles,
  );

  router.post(
    '/clubs/:clubId/roles',
    requireAuth,
    csrfHeader,
    validate({ params: clubIdParam, body: assignRoleBody }),
    authorize(authz, { role: 'CH', resolveScope: async (req) => ({ clubId: req.params.clubId }) }),
    clubController.assignRole,
  );

  router.delete(
    '/clubs/:clubId/roles/:assignmentId',
    requireAuth,
    csrfHeader,
    validate({ params: assignmentIdParam }),
    authorize(authz, { role: 'CH', resolveScope: async (req) => ({ clubId: req.params.clubId }) }),
    clubController.revokeRole,
  );

  return router;
}
