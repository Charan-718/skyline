import { Router } from 'express';
import { requireAuth, optionalAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { requireIdempotencyKey, idempotencyMiddleware } from '../../shared/middleware/idempotency.js';
import { authorize } from '../../shared/middleware/authorize.js';
import {
  eventIdParam,
  clubIdParam,
  bookingBody,
  checkInBody,
  createEventBody,
  updateEventBody,
  cancelEventBody,
  organizersBody,
  staffBody,
  eventStaffParams,
  ticketIdParam,
  clubEventsQuery,
  bookingsQuery,
} from './schemas.js';

export function createEventRoutes({ eventController, authz }) {
  const router = Router();

  router.get('/events', eventController.list);
  router.get(
    '/clubs/:clubId/events',
    optionalAuth,
    validate({ params: clubIdParam, query: clubEventsQuery }),
    eventController.clubEvents,
  );
  router.get(
    '/events/:eventId',
    optionalAuth,
    validate({ params: eventIdParam }),
    eventController.get,
  );
  router.get(
    '/events/:eventId/price-quote',
    requireAuth,
    validate({ params: eventIdParam }),
    eventController.quote,
  );

  router.post(
    '/clubs/:clubId/events',
    requireAuth,
    csrfHeader,
    validate({ params: clubIdParam, body: createEventBody }),
    authorize(authz, { role: 'CH', resolveScope: async (req) => ({ clubId: req.params.clubId }) }),
    eventController.create,
  );

  router.patch(
    '/events/:eventId',
    requireAuth,
    csrfHeader,
    validate({ params: eventIdParam, body: updateEventBody }),
    eventController.update,
  );

  router.post(
    '/events/:eventId/publish',
    requireAuth,
    csrfHeader,
    validate({ params: eventIdParam }),
    eventController.publish,
  );

  router.post(
    '/events/:eventId/cancel',
    requireAuth,
    csrfHeader,
    validate({ params: eventIdParam, body: cancelEventBody }),
    eventController.cancel,
  );

  router.post(
    '/events/:eventId/complete',
    requireAuth,
    csrfHeader,
    validate({ params: eventIdParam }),
    eventController.complete,
  );

  router.get(
    '/events/:eventId/organizers',
    requireAuth,
    validate({ params: eventIdParam }),
    eventController.organizers,
  );

  router.put(
    '/events/:eventId/organizers',
    requireAuth,
    csrfHeader,
    validate({ params: eventIdParam, body: organizersBody }),
    eventController.setOrganizers,
  );

  router.get(
    '/events/:eventId/staff',
    requireAuth,
    validate({ params: eventIdParam }),
    eventController.staff,
  );

  router.post(
    '/events/:eventId/staff',
    requireAuth,
    csrfHeader,
    validate({ params: eventIdParam, body: staffBody }),
    eventController.addStaff,
  );

  router.delete(
    '/events/:eventId/staff/:userId',
    requireAuth,
    csrfHeader,
    validate({ params: eventStaffParams }),
    eventController.removeStaff,
  );

  router.post(
    '/events/:eventId/bookings',
    requireAuth,
    csrfHeader,
    requireIdempotencyKey,
    idempotencyMiddleware(),
    validate({ params: eventIdParam, body: bookingBody }),
    eventController.book,
  );

  router.get(
    '/events/:eventId/bookings',
    requireAuth,
    validate({ params: eventIdParam, query: bookingsQuery }),
    eventController.bookings,
  );

  router.get('/me/tickets', requireAuth, eventController.myTickets);
  router.get(
    '/me/tickets/:ticketId',
    requireAuth,
    validate({ params: ticketIdParam }),
    eventController.myTicket,
  );

  router.post(
    '/events/:eventId/check-ins',
    requireAuth,
    csrfHeader,
    requireIdempotencyKey,
    idempotencyMiddleware(),
    validate({ params: eventIdParam, body: checkInBody }),
    eventController.checkIn,
  );

  router.get(
    '/events/:eventId/check-ins',
    requireAuth,
    validate({ params: eventIdParam }),
    eventController.checkIns,
  );

  return router;
}
