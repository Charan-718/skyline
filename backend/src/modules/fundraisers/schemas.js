import { z } from 'zod';
import { instantSchema, isoDateSchema } from '../../shared/dates.js';
import { FUNDRAISER_STATUSES, TASK_STATUSES } from './domain/fundraiserRules.js';

const name = z.string().trim().min(1).max(150);
const description = z.string().max(5000);
const goal = z.number().int().positive().safe();
const nonEmpty = (o) => Object.keys(o).length > 0;

export const clubIdParams = z.object({ clubId: z.string().uuid() });
export const fundraiserIdParams = z.object({ id: z.string().uuid() });
export const taskIdParams = z.object({ taskId: z.string().uuid() });

export const listFundraisersQuery = z.object({ status: z.enum(FUNDRAISER_STATUSES).optional() }).strict();
export const myTasksQuery = z.object({ status: z.enum(TASK_STATUSES).optional() }).strict();

export const createFundraiserBody = z
  .object({
    name,
    description: description.default(''),
    startsOn: isoDateSchema,
    targetDate: isoDateSchema,
    goalAmountPaise: goal.nullable().optional(),
  })
  .strict()
  .refine((b) => b.targetDate >= b.startsOn, { message: 'targetDate must be on or after startsOn', path: ['targetDate'] });

export const patchFundraiserBody = z
  .object({
    name: name.optional(),
    description: description.optional(),
    startsOn: isoDateSchema.optional(),
    targetDate: isoDateSchema.optional(),
    goalAmountPaise: goal.nullable().optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  })
  .strict()
  .refine(nonEmpty, { message: 'at least one field is required' });

export const createTaskBody = z
  .object({
    title: name,
    description: description.default(''),
    assigneeUserId: z.string().uuid().nullable().optional(),
    deadline: instantSchema,
  })
  .strict();

export const patchTaskBody = z
  .object({
    title: name.optional(),
    description: description.optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    deadline: instantSchema.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine(nonEmpty, { message: 'at least one field is required' });
