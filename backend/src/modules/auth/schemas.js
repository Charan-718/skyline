import { z } from 'zod';

const phoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/)
  .optional()
  .nullable();

export const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100),
  phoneE164: phoneE164,
});

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileBody = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phoneE164: phoneE164,
});

export const collegeVerificationBody = z.object({
  studentIdentifier: z.string().min(1),
  fullName: z.string().min(2).max(100),
});
