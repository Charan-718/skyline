import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';

const listQuery = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  linkedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Dev-only roster inspection (LLD §4.11). */
export function createCollegeRosterDevRoutes({ collegeRosterRepository, config }) {
  const r = Router();

  r.get('/dev/college-roster', validate({ query: listQuery }), async (req, res) => {
    const list = await collegeRosterRepository.list({
      q: req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize,
      linkedOnly: req.query.linkedOnly,
    });
    const stats = await collegeRosterRepository.stats();
    res.json({
      data: {
        source: 'college_student_roster',
        verificationMode: config.COLLEGE_VERIFICATION_MODE,
        note:
          'College-domain register: email + fullName vs roster. Outsiders: POST /me/college-verification with student ID + fullName (email match not required).',
        stats,
        ...list,
      },
    });
  });

  return r;
}
