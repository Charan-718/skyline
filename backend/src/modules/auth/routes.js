import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth.js';
import { csrfHeader } from '../../shared/middleware/csrfHeader.js';
import { validate } from '../../shared/middleware/validate.js';
import { authRateLimit } from '../../shared/middleware/rateLimits.js';
import {
  registerBody,
  loginBody,
  updateProfileBody,
  collegeVerificationBody,
} from './schemas.js';

export function createAuthRoutes({ authController }) {
  const router = Router();

  router.post('/auth/register', csrfHeader, validate({ body: registerBody }), authController.register);
  router.post('/auth/login', authRateLimit, csrfHeader, validate({ body: loginBody }), authController.login);
  router.post('/auth/logout', requireAuth, csrfHeader, authController.logout);
  router.get('/auth/me', requireAuth, authController.me);
  router.patch('/me', requireAuth, csrfHeader, validate({ body: updateProfileBody }), authController.updateProfile);
  router.post(
    '/me/college-verification',
    requireAuth,
    csrfHeader,
    validate({ body: collegeVerificationBody }),
    authController.submitVerification,
  );
  router.get('/me/college-verification', requireAuth, authController.getVerification);

  return router;
}
