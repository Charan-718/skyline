import { z } from 'zod';

export const clubIdParam = z.object({
  clubId: z.string().uuid(),
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
