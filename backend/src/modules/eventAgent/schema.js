import { z } from 'zod';
import { createEventBody, updateEventBody } from '../events/schemas.js';
import { FIELD_KEYS, OPS } from './fields.js';

// 1) What Gemini must return (structured output, OpenAPI-subset schema), and the zod check we run on
//    it anyway. 2) The request bodies of the two agent endpoints.

export const INTENTS = Object.freeze(['EVENT_DETAILS', 'MULTIPLE_EVENTS', 'CANCEL_OR_DELETE', 'OUT_OF_SCOPE']);

export const RESPONSE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: [...INTENTS] },
    ops: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          field: { type: 'STRING', enum: [...FIELD_KEYS] },
          op: { type: 'STRING', enum: [...OPS] },
          source: { type: 'STRING', enum: ['user', 'generated'] },
          phrase: { type: 'STRING' },
          text: { type: 'STRING', nullable: true },
          number: { type: 'NUMBER', nullable: true },
          boolean: { type: 'BOOLEAN', nullable: true },
          date: { type: 'STRING', nullable: true },
          time: { type: 'STRING', nullable: true },
          minutes: { type: 'INTEGER', nullable: true },
        },
        required: ['field', 'op', 'source', 'phrase'],
      },
    },
    ambiguities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          field: { type: 'STRING', enum: [...FIELD_KEYS] },
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['field', 'question'],
      },
    },
    publishRequested: { type: 'BOOLEAN' },
  },
  required: ['intent', 'ops', 'ambiguities', 'publishRequested'],
});

const nullish = (schema) => schema.nullable().optional().transform((v) => (v === null ? undefined : v));

const opItem = z.object({
  field: z.string(),
  op: z.enum(OPS),
  source: z.enum(['user', 'generated']),
  phrase: z.string().max(500).default(''),
  text: nullish(z.string().max(6000)),
  number: nullish(z.number()),
  boolean: nullish(z.boolean()),
  date: nullish(z.string().max(20)),
  time: nullish(z.string().max(20)),
  minutes: nullish(z.number().int()),
});
const ambiguityItem = z.object({
  field: z.string(),
  question: z.string().trim().min(1).transform((q) => q.slice(0, 500)),
  options: z
    .array(z.string())
    .optional()
    .default([])
    .transform((o) => o.slice(0, 8).map((x) => String(x).slice(0, 200))),
});

/**
 * Validates the model's reply item by item: a malformed op or ambiguity is dropped on its own instead
 * of failing the whole turn (the field then simply stays missing and is asked about). Returns
 * { reply, dropped: [paths] } or null when the reply is not even an object.
 */
export function parseModelReply(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const dropped = [];
  const keep = (list, schema, name) =>
    (Array.isArray(list) ? list : []).slice(0, 40).flatMap((item, i) => {
      const r = schema.safeParse(item);
      if (r.success) return [r.data];
      dropped.push(`${name}[${i}]:${r.error.issues.map((x) => x.path.join('.') || x.code).join(',')}`);
      return [];
    });
  if (json.ops !== undefined && !Array.isArray(json.ops)) dropped.push('ops:not-an-array');
  const intent = INTENTS.includes(json.intent) ? json.intent : 'EVENT_DETAILS';
  if (json.intent !== intent) dropped.push('intent');
  return {
    reply: {
      intent,
      ops: keep(json.ops, opItem, 'ops'),
      ambiguities: keep(json.ambiguities, ambiguityItem, 'ambiguities'),
      publishRequested: json.publishRequested === true,
    },
    dropped,
  };
}

/** Kept for callers that want the strict shape. */
export const modelReply = z.object({ intent: z.enum(INTENTS), ops: z.array(opItem), ambiguities: z.array(ambiguityItem), publishRequested: z.boolean() });

// ---- request bodies ----

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const message = z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(2000) }).strict();
const piece = z.object({ date: z.string().regex(DATE).optional(), time: z.string().regex(TIME).optional() }).strict();
const partials = z
  .object({
    start: piece.optional(),
    end: piece.optional(),
    registrationOpens: piece.optional(),
    registrationCloses: piece.optional(),
    earlyAccessOpens: piece.optional(),
    earlyBirdEnds: piece.optional(),
    durationMinutes: z.object({ minutes: z.number().int().positive().max(20160), phrase: z.string().max(500).nullable().optional() }).strict().optional(),
  })
  .strict()
  .default({});
const SOURCE_KEYS = Object.keys(createEventBody.shape);
const sources = z.partialRecord(z.enum(SOURCE_KEYS), z.enum(['user', 'generated', 'suggested', 'default'])).default({});
const messages = z
  .array(message)
  .min(1)
  .max(20)
  .refine((m) => m.some((x) => x.role === 'user'), { message: 'At least one user message is required.' });

export const createTurnBody = z.object({ messages, draft: createEventBody.partial().strict().default({}), sources, partials }).strict();
export const editTurnBody = z.object({ messages, patch: updateEventBody.strict().default({}), sources, partials }).strict();
