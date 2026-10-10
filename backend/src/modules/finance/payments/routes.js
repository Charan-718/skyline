import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../../shared/middleware/csrfHeader.js';
import { validate } from '../../../shared/middleware/validate.js';
import { requireIdempotencyKey, idempotencyMiddleware } from '../../../shared/middleware/idempotency.js';
import { simulatePaymentBody, paymentIdParam } from './schemas.js';

export function createPaymentRoutes({ paymentController }) {
  const router = Router();

  router.get('/payments/:paymentId', requireAuth, validate({ params: paymentIdParam }), paymentController.getPayment);

  router.post(
    '/payments/:paymentId/simulate',
    requireAuth,
    csrfHeader,
    requireIdempotencyKey,
    idempotencyMiddleware(),
    validate({ params: paymentIdParam, body: simulatePaymentBody }),
    paymentController.simulate,
  );

  return router;
}
