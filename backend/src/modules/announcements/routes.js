import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { requireIdempotencyKey, idempotencyMiddleware } from '../../shared/middleware/idempotency.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { clubIdParam, announcementIdParam, createAnnouncementBody } from './schemas.js';

export function createAnnouncementRoutes({ announcementController, authz }) {
  const router = Router();

  router.get('/announcements', announcementController.list);
  router.get('/announcements/:id', validate({ params: announcementIdParam }), announcementController.get);

  router.post(
    '/clubs/:clubId/announcements',
    requireAuth,
    csrfHeader,
    validate({ params: clubIdParam, body: createAnnouncementBody }),
    authorize(authz, { role: 'CH', resolveScope: async (req) => ({ clubId: req.params.clubId }) }),
    announcementController.create,
  );

  router.post(
    '/announcements/:id/publish',
    requireAuth,
    csrfHeader,
    requireIdempotencyKey,
    idempotencyMiddleware(),
    validate({ params: announcementIdParam }),
    announcementController.publish,
  );

  return router;
}
