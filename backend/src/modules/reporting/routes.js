import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { validate } from '../../shared/middleware/validate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { z } from 'zod';

const eventIdParam = z.object({ eventId: z.string().uuid() });

export function createReportingRoutes({ eventReportService, authz, eventRepository }) {
  const router = Router();

  router.get(
    '/events/:eventId/report',
    requireAuth,
    validate({ params: eventIdParam }),
    authorize(authz, {
      role: 'TR',
      resolveScope: async (req) => {
        const event = await eventRepository.findById(req.params.eventId);
        return { clubId: event?.clubId, eventId: req.params.eventId };
      },
    }),
    async (req, res, next) => {
      try {
        const event = await eventRepository.findById(req.params.eventId);
        const allowed =
          (await authz.isTreasurer(req.userId, event.clubId)) ||
          (await authz.isClubHead(req.userId, event.clubId)) ||
          (await authz.isOrganizer(req.userId, req.params.eventId));
        if (!allowed) {
          const { AppError } = await import('../../shared/errors.js');
          return next(new AppError('FORBIDDEN', 403, 'Forbidden'));
        }
        const report = await eventReportService.getEventReport(req.params.eventId);
        res.json({ data: report });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
