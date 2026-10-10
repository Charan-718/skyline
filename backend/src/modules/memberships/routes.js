import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { requireIdempotencyKey, idempotencyMiddleware } from '../../shared/middleware/idempotency.js';
import { authorize } from '../../shared/middleware/authorize.js';
import {
  clubIdParam,
  membershipIdParam,
  registerMembershipBody,
  renewMembershipBody,
  createPlanBody,
  verifyMembershipBody,
} from './schemas.js';

export function createMembershipRoutes({ membershipController, authz }) {
  const router = Router();

  router.get(
    '/clubs/:clubId/plans',
    requireAuth,
    validate({ params: clubIdParam }),
    membershipController.listPlans,
  );

  router.post(
    '/clubs/:clubId/plans',
    requireAuth,
    csrfHeader,
    validate({ params: clubIdParam, body: createPlanBody }),
    authorize(authz, { role: 'CH', resolveScope: async (req) => ({ clubId: req.params.clubId }) }),
    membershipController.createPlan,
  );

  router.post(
    '/clubs/:clubId/memberships',
    requireAuth,
    csrfHeader,
    requireIdempotencyKey,
    idempotencyMiddleware(),
    validate({ params: clubIdParam, body: registerMembershipBody }),
    membershipController.register,
  );

  router.get('/me/memberships', requireAuth, membershipController.listMine);

  router.post(
    '/me/memberships/:membershipId/renewals',
    requireAuth,
    csrfHeader,
    requireIdempotencyKey,
    idempotencyMiddleware(),
    validate({ params: membershipIdParam, body: renewMembershipBody }),
    membershipController.renew,
  );

  router.get(
    '/me/memberships/:membershipId/digital-id',
    requireAuth,
    validate({ params: membershipIdParam }),
    membershipController.digitalId,
  );

  router.post(
    '/me/memberships/:membershipId/digital-id/rotate',
    requireAuth,
    csrfHeader,
    validate({ params: membershipIdParam }),
    membershipController.rotateDigitalId,
  );

  router.post(
    '/membership-verifications',
    requireAuth,
    csrfHeader,
    validate({ body: verifyMembershipBody }),
    membershipController.verifyQr,
  );

  return router;
}
