import { z } from 'zod';
import { paginationQuery } from '../../../shared/pagination.js';
import { PAYMENT_PURPOSES, PAYMENT_STATUS, SIMULATE_OUTCOMES } from '../domain/paymentStateMachine.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const paymentIdParams = z.object({ paymentId: z.string().uuid() });
export const clubIdParams = z.object({ clubId: z.string().uuid() });

export const simulateBody = z.object({ outcome: z.enum(SIMULATE_OUTCOMES) }).strict();

export const myPaymentsQuery = z
  .object({
    purpose: z.enum(PAYMENT_PURPOSES).optional(),
    status: z.enum(Object.values(PAYMENT_STATUS)).optional(),
    ...paginationQuery,
  })
  .strict();

export const clubPaymentsQuery = z
  .object({
    purpose: z.enum(PAYMENT_PURPOSES).optional(),
    status: z.enum(Object.values(PAYMENT_STATUS)).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    ...paginationQuery,
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must not be after to', path: ['from'] });
