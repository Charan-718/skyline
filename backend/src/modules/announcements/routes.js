import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { requireIdempotencyKey, idempotencyMiddleware } from '../../shared/middleware/idempotency.js';
import { authorize } from '../../shared/middleware/authorize.js';
import {
  clubIdParam,
  announcementIdParam,
  createAnnouncementBody,
  updateAnnouncementBody,
  deliveriesQuery,
  clubAnnouncementsQuery,
} from './schemas.js';

export function createAnnouncementRoutes({ announcementController, authz }) {
  const router = Router();

  router.get('/announcements', announcementController.list);
  router.get('/announcements/:id', validate({ params: announcementIdParam }), announcementController.get);

  router.get(
    '/clubs/:clubId/announcements',
    requireAuth,
    validate({ params: clubIdParam, query: clubAnnouncementsQuery }),
    announcementController.clubList,
  );

  router.patch(
    '/announcements/:id',
    requireAuth,
    csrfHeader,
    validate({ params: announcementIdParam, body: updateAnnouncementBody }),
    announcementController.update,
  );

  router.delete(
    '/announcements/:id',
    requireAuth,
    csrfHeader,
    validate({ params: announcementIdParam }),
    announcementController.remove,
  );

  router.get(
    '/announcements/:id/deliveries',
    requireAuth,
    validate({ params: announcementIdParam, query: deliveriesQuery }),
    announcementController.deliveries,
  );

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
