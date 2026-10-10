import { z } from 'zod';

export const clubIdParam = z.object({ clubId: z.string().uuid() });
export const planIdParam = z.object({ planId: z.string().uuid() });
export const membershipIdParam = z.object({ membershipId: z.string().uuid() });

export const registerMembershipBody = z.object({
  planId: z.string().uuid(),
  expectedFeePaise: z.coerce.number().int().min(0),
});

export const renewMembershipBody = registerMembershipBody;

export const createPlanBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  benefitsText: z.string().optional(),
  feePaise: z.coerce.number().int().min(0),
  durationMonths: z.coerce.number().int().min(1).max(24),
  eventDiscountBps: z.coerce.number().int().min(0).max(10000).optional(),
  merchDiscountBps: z.coerce.number().int().min(0).max(10000).optional(),
  earlyBirdAccess: z.boolean().optional(),
});

export const verifyMembershipBody = z.object({
  qrPayload: z.string().min(1),
});

export const updatePlanBody = createPlanBody.partial();

export const autopayBody = z.object({
  enabled: z.boolean(),
  planId: z.string().uuid().optional(),
  acknowledgeSimulated: z.boolean().optional(),
  consentTextVersion: z.string().optional(),
});

export const clubMembersQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  planId: z.string().uuid().optional(),
  expiringWithin: z.coerce.number().int().optional(),
});
