import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { isoDateSchema } from '../../shared/dates.js';

// LLD §4.10 reports. Finance report: CH, TR.

const clubIdParams = z.object({ clubId: z.string().uuid() });
const periodQuery = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must not be after to', path: ['from'] });

export function createReportingRoutes({ controller, requireAuth, requireClubRole }) {
  const r = Router();
  r.get(
    '/clubs/:clubId/reports/finance',
    requireAuth,
    validate({ params: clubIdParams, query: periodQuery }),
    requireClubRole(['CLUB_HEAD', 'TREASURER']),
    controller.financeReport,
  );
  return r;
}
