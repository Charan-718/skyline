import { z } from 'zod';

export const simulatePaymentBody = z.object({
  outcome: z.enum(['SUCCEEDED', 'FAILED', 'PENDING']),
});

export const paymentIdParam = z.object({
  paymentId: z.string().uuid(),
});
