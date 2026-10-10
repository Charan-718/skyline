import { z } from 'zod';
import { paginationQuery } from '../../shared/pagination.js';
import { instantSchema } from '../../shared/dates.js';
import { parseItemsParam } from './domain/orderRules.js';

// Request schemas (LLD §4.7).

const uuid = z.string().uuid();
const paise = z.number().int().positive().safe();
const sizeLabel = z.string().trim().min(1).max(20).transform((s) => s.toUpperCase());
const variantInput = z
  .object({ sizeLabel, initialStock: z.number().int().min(0).max(100000), lowStockThreshold: z.number().int().min(0).max(100000).optional() })
  .strict();
const isoInstant = z.string().datetime({ offset: true });

export const clubIdParams = z.object({ clubId: uuid });
export const productIdParams = z.object({ productId: uuid });
export const variantIdParams = z.object({ variantId: uuid });
export const orderIdParams = z.object({ orderId: uuid });

export const categoryBody = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export const productsQuery = z
  .object({ categoryId: uuid.optional(), all: z.enum(['true', 'false']).transform((v) => v === 'true').optional() })
  .strict();

export const createProductBody = z
  .object({
    categoryId: uuid,
    name: z.string().trim().min(1).max(150),
    description: z.string().max(5000).default(''),
    pricePaise: paise,
    memberDiscountEligible: z.boolean().default(true),
    availableToNonMembers: z.boolean().default(false),
    offerPricePaise: paise.nullable().optional(),
    offerStartsAt: isoInstant.nullable().optional(),
    offerEndsAt: isoInstant.nullable().optional(),
    variants: z.array(variantInput).min(1).max(20),
  })
  .strict();

export const patchProductBody = z
  .object({
    categoryId: uuid.optional(),
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().max(5000).optional(),
    pricePaise: paise.optional(),
    memberDiscountEligible: z.boolean().optional(),
    availableToNonMembers: z.boolean().optional(),
    offerPricePaise: paise.nullable().optional(),
    offerStartsAt: isoInstant.nullable().optional(),
    offerEndsAt: isoInstant.nullable().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'at least one field is required' });

export const statusBody = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']) }).strict();
export const addVariantBody = variantInput;
export const patchVariantBody = z
  .object({ lowStockThreshold: z.number().int().min(0).max(100000).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'at least one field is required' });
export const adjustmentBody = z
  .object({ type: z.enum(['RESTOCK', 'ADJUSTMENT']), quantity: z.number().int(), reason: z.string().trim().min(1).max(200) })
  .strict();

export const alertsQuery = z.object({ status: z.enum(['OPEN', 'RESOLVED']).optional() }).strict();

const itemSchema = z.object({ variantId: uuid, quantity: z.number().int().min(1).max(10) }).strict();
export const quoteQuery = z
  .object({
    items: z.string().transform((v, c) => {
      const items = parseItemsParam(v);
      if (!items || !items.every((i) => i.quantity >= 1 && i.quantity <= 10)) {
        c.addIssue({ code: z.ZodIssueCode.custom, message: 'expected items=variantId:qty,… with qty 1–10' });
        return z.NEVER;
      }
      return items;
    }),
  })
  .strict();
// TOO_MANY_ITEMS (> 10 lines) is a domain error, so the schema allows up to 50 lines.
export const placeOrderBody = z.object({ items: z.array(itemSchema).min(1).max(50), expectedTotalPaise: z.number().int().safe() }).strict();
export const ordersQuery = z
  .object({ status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'PICKED_UP', 'CANCELLED', 'EXPIRED']).optional(), q: z.string().trim().max(20).optional(), ...paginationQuery })
  .strict();
export const myOrdersQuery = z.object({ ...paginationQuery }).strict();
export const pickupBody = z.object({ pickupCode: z.string().trim().min(4).max(20) }).strict();

export { instantSchema };
