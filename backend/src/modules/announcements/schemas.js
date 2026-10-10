import { z } from 'zod';

export const clubIdParam = z.object({ clubId: z.string().uuid() });
export const announcementIdParam = z.object({ id: z.string().uuid() });

export const createAnnouncementBody = z.object({
  title: z.string().min(1).max(150),
  body: z.string().min(1).max(5000),
  category: z.enum(['MEETING', 'DEADLINE', 'EVENT', 'SCHEDULE_CHANGE', 'GENERAL']),
  audience: z.enum(['PUBLIC', 'MEMBERS']),
  sendEmail: z.boolean().optional(),
  eventId: z.string().uuid().optional().nullable(),
});
