import { z } from 'zod';

export const eventIdParam = z.object({ eventId: z.string().uuid() });
export const clubIdParam = z.object({ clubId: z.string().uuid() });

export const bookingBody = z.object({
  expectedFinalPricePaise: z.coerce.number().int().min(0),
});

export const checkInBody = z.object({
  qrPayload: z.string().min(1),
});

export const cancelEventBody = z.object({
  reason: z.string().min(1),
});

export const organizersBody = z.object({
  userIds: z.array(z.string().uuid()),
});

export const staffBody = z.object({
  userId: z.string().uuid(),
});

export const userIdParam = z.object({ userId: z.string().uuid() });
export const eventStaffParams = eventIdParam.merge(userIdParam);
export const ticketIdParam = z.object({ ticketId: z.string().uuid() });

export const clubEventsQuery = z.object({
  all: z.enum(['true', 'false']).optional(),
});

export const bookingsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().optional(),
  buyerType: z.string().optional(),
  q: z.string().optional(),
});

export const createEventBody = z.object({
  title: z.string().min(1).max(150),
  description: z.string().optional(),
  venue: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  registrationOpensAt: z.string().datetime(),
  registrationClosesAt: z.string().datetime(),
  earlyAccessOpensAt: z.string().datetime().optional().nullable(),
  capacity: z.coerce.number().int().positive(),
  memberPricePaise: z.coerce.number().int().min(0),
  nonMemberPricePaise: z.coerce.number().int().min(0).optional().nullable(),
  memberDiscountEligible: z.boolean().optional(),
  earlyBirdMemberPricePaise: z.coerce.number().int().min(0).optional().nullable(),
  earlyBirdNonMemberPricePaise: z.coerce.number().int().min(0).optional().nullable(),
  earlyBirdEndsAt: z.string().datetime().optional().nullable(),
  earlyBirdQuantity: z.coerce.number().int().positive().optional().nullable(),
});

export const updateEventBody = createEventBody.partial();
