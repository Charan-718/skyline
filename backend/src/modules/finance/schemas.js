import { z } from 'zod';
import { isoDateSchema } from '../../shared/dates.js';
import { paginationQuery } from '../../shared/pagination.js';
import { LEDGER_CATEGORIES } from './domain/ledgerRules.js';
import { EXPENSE_KINDS, EXPENSE_STATUSES } from './domain/expenseStateMachine.js';

// Request schemas for expenses, income, budgets and finance reads (LLD §4.9).
// Multipart fields arrive as strings: paise must be a plain integer string (no decimals).

const paise = z
  .union([z.number().int(), z.string().regex(/^\d{1,15}$/, 'expected an integer number of paise').transform(Number)])
  .refine((v) => Number.isSafeInteger(v) && v > 0, 'must be an integer > 0');
const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional());
const optionalText = (max) => z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(max).optional());
const nonEmpty = (o) => Object.keys(o).length > 0;

export const idParams = z.object({ id: z.string().uuid() });
export const clubIdParams = z.object({ clubId: z.string().uuid() });
export const budgetIdParams = z.object({ budgetId: z.string().uuid() });

export const submitExpenseBody = z
  .object({
    kind: z.enum(EXPENSE_KINDS),
    title: z.string().trim().min(1).max(150),
    description: z.string().max(5000).default(''),
    amountPaise: paise,
    incurredOn: isoDateSchema,
    eventId: optionalUuid,
    fundraiserId: optionalUuid,
  })
  .strict()
  .refine((b) => !(b.eventId && b.fundraiserId), { message: 'link either an event or a fundraiser, not both', path: ['fundraiserId'] });

export const approveBody = z.object({ note: optionalText(1000) }).strict();
export const rejectBody = z.object({ note: z.string().trim().min(1).max(1000) }).strict();
export const markPaidBody = z.object({ payoutReference: z.string().trim().min(1).max(100), paidOn: isoDateSchema }).strict();

export const expensesQuery = z
  .object({
    status: z.enum(EXPENSE_STATUSES).optional(),
    kind: z.enum(EXPENSE_KINDS).optional(),
    eventId: z.string().uuid().optional(),
    fundraiserId: z.string().uuid().optional(),
    ...paginationQuery,
  })
  .strict();
export const myExpensesQuery = z.object({ status: z.enum(EXPENSE_STATUSES).optional(), ...paginationQuery }).strict();

export const incomeEntryBody = z
  .object({
    fundraiserId: z.string().uuid(),
    amountPaise: paise,
    receivedOn: isoDateSchema,
    description: z.string().trim().min(1).max(500),
    reference: optionalText(100),
  })
  .strict();

const budgetFields = {
  name: z.string().trim().min(1).max(150),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  amountPaise: z.number().int().positive().safe(),
  notes: z.string().max(2000).nullable(),
};
export const createBudgetBody = z
  .object({ ...budgetFields, notes: budgetFields.notes.optional() })
  .strict()
  .refine((b) => b.periodEnd >= b.periodStart, { message: 'periodEnd must be on or after periodStart', path: ['periodEnd'] });
export const patchBudgetBody = z
  .object(Object.fromEntries(Object.entries(budgetFields).map(([k, v]) => [k, v.optional()])))
  .strict()
  .refine(nonEmpty, { message: 'at least one field is required' })
  .refine((b) => !b.periodStart || !b.periodEnd || b.periodEnd >= b.periodStart, { message: 'periodEnd must be on or after periodStart', path: ['periodEnd'] });

const period = {
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
};
const periodOrder = (q) => !q.from || !q.to || q.from <= q.to;
export const summaryQuery = z.object(period).strict().refine(periodOrder, { message: 'from must not be after to', path: ['from'] });
export const transactionsQuery = z
  .object({
    direction: z.enum(['IN', 'OUT']).optional(),
    category: z.enum([...LEDGER_CATEGORIES.IN, ...LEDGER_CATEGORIES.OUT]).optional(),
    eventId: z.string().uuid().optional(),
    fundraiserId: z.string().uuid().optional(),
    ...period,
    ...paginationQuery,
  })
  .strict()
  .refine(periodOrder, { message: 'from must not be after to', path: ['from'] });
