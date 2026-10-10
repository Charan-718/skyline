import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../shared/middleware/validate.js';
import { instantSchema } from '../shared/dates.js';
import { appError } from '../shared/errors.js';

// POST /dev/jobs/:jobName/run { asOf?, autopayOutcome? } (dev tools only, AUTH; LLD §4.11).

const params = z.object({ jobName: z.string().regex(/^[a-z-]{1,50}$/) });
const body = z.object({ asOf: instantSchema.optional(), autopayOutcome: z.enum(['SUCCEEDED', 'FAILED', 'PENDING']).optional() }).strict();

export function createJobDevRoutes({ registry, requireAuth }) {
  const r = Router();
  r.post('/dev/jobs/:jobName/run', requireAuth, validate({ params, body }), async (req, res) => {
    const { asOf, autopayOutcome } = req.valid.body;
    const result = await registry.run(req.valid.params.jobName, { asOf, options: autopayOutcome ? { autopayOutcome } : {} });
    if (!result) throw appError('NOT_FOUND');
    res.json({ data: result });
  });
  return r;
}
