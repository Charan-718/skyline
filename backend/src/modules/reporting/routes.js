import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { validate } from '../../shared/middleware/validate.js';
import { AppError, assertFound } from '../../shared/errors.js';
import { z } from 'zod';

const eventIdParam = z.object({ eventId: z.string().uuid() });

export function createEventReportingRoutes({ eventReportService, authz, eventRepository }) {
  const router = Router();

  router.get(
    '/events/:eventId/report',
    requireAuth,
    validate({ params: eventIdParam }),
    async (req, res, next) => {
      try {
        const eventId = req.valid.params.eventId;
        const event = await eventRepository.findById(eventId);
        assertFound(event, 'Event not found');
        const allowed =
          (await authz.isTreasurer(req.userId, event.clubId)) ||
          (await authz.isClubHead(req.userId, event.clubId)) ||
          (await authz.isOrganizer(req.userId, eventId));
        if (!allowed) {
          return next(new AppError('FORBIDDEN', 403, 'Forbidden'));
        }
        const report = await eventReportService.getEventReport(eventId);
        res.json({ data: report });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
