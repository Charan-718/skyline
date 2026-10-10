import { z } from 'zod';

/** UUID or URL slug (mock/live frontend uses slugs in `/clubs/:clubId`). */
export const clubRefSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (s) =>
      z.string().uuid().safeParse(s).success || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s),
    { message: 'Invalid club identifier' },
  );

export const clubIdParam = z.object({
  clubId: clubRefSchema,
});

export const assignmentIdParam = z.object({
  clubId: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const assignRoleBody = z.object({
  userEmail: z.string().email(),
  role: z.enum(['CLUB_HEAD', 'TREASURER', 'VOLUNTEER']),
});

export const listClubsQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  q: z.string().optional(),
});
