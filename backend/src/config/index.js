import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../loadEnv.js';
import { z } from 'zod';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

if (!process.env.COLLEGE_EMAIL_DOMAINS && process.env.REGISTRATION_EMAIL_DOMAINS) {
  process.env.COLLEGE_EMAIL_DOMAINS = process.env.REGISTRATION_EMAIL_DOMAINS;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  UPLOAD_DIR: z
    .string()
    .default('uploads')
    .transform((v) => {
      const trimmed = v.trim();
      return path.isAbsolute(trimmed) ? trimmed : path.resolve(backendRoot, trimmed);
    }),
  MAX_UPLOAD_BYTES: z.coerce.number().default(5242880),
  RESERVATION_HOLD_MINUTES: z.coerce.number().default(15),
  AUTOPAY_PENDING_TIMEOUT_HOURS: z.coerce.number().default(24),
  PRICING_COMBINATION_MODE: z.enum(['BEST_OF', 'STACK']).default('BEST_OF'),
  /** Comma-separated college email domains (register + roster check, not a signup blocklist). */
  COLLEGE_EMAIL_DOMAINS: z
    .string()
    .default('skyline.ac.in')
    .transform((v) =>
      v
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  COLLEGE_VERIFICATION_MODE: z.enum(['mock', 'database', 'unconfigured']).default('database'),
  VERIFICATION_HASH_KEY: z.string().min(8).default('dev-key-change-me'),
  NOTIFY_MODE: z.enum(['dev', 'unconfigured', 'smtp']).default('dev'),
  /** Used in links inside notifications (renew URL). */
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  /** SMTP mailbox for email (only read when NOTIFY_MODE=smtp). Gmail: smtp.gmail.com:465 + App Password. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  /** true = TLS from the start (port 465); false = STARTTLS upgrade (port 587). Default follows the port. */
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Defaults to SMTP_USER. Gmail rewrites the sender to the authenticated account. */
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('SOMS'),
  DEV_NOTIFY_FAIL_CHANNEL: z.string().optional(),
  SIM_AUTOPAY_OUTCOME: z.enum(['SUCCEEDED', 'FAILED', 'PENDING']).default('SUCCEEDED'),
  DEV_TOOLS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  SEED_ON_START: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  JOBS_ENABLED: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  FUNDRAISER_AT_RISK_TOLERANCE_PCT: z.coerce.number().default(20),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is required in production');
  process.exit(1);
}

export const config = {
  ...env,
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-not-for-production',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  devToolsEnabled: env.DEV_TOOLS_ENABLED && env.NODE_ENV !== 'production',
  fundraiserAtRiskTolerancePct: env.FUNDRAISER_AT_RISK_TOLERANCE_PCT,
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromEmail: env.SMTP_FROM_EMAIL || env.SMTP_USER,
    fromName: env.SMTP_FROM_NAME,
  },
};
