import { z } from 'zod';

// Environment parsing (LLD §1.3). Fails fast on startup with every problem listed.
// OD-xx defaults sit behind exactly one variable each (OQ-26).

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const intFrom = (def, min, max) => z.coerce.number().int().min(min).max(max).default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFrom(4000, 1, 65535),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: intFrom(20, 2, 100),
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  CORS_ORIGIN: z.string().default(''),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  UPLOAD_DIR: z.string().default('/app/uploads'),
  MAX_UPLOAD_BYTES: intFrom(5242880, 1, 5242880),
  RESERVATION_HOLD_MINUTES: intFrom(15, 1, 1440), // ASM-13
  AUTOPAY_PENDING_TIMEOUT_HOURS: intFrom(24, 1, 720),
  PRICING_COMBINATION_MODE: z.enum(['BEST_OF', 'STACK']).default('BEST_OF'), // OD-01
  DEFAULT_LOW_STOCK_THRESHOLD: intFrom(5, 0, 100000),
  FUNDRAISER_AT_RISK_TOLERANCE_PCT: intFrom(20, 0, 100), // LLD §2.9, needs team validation
  COLLEGE_VERIFICATION_MODE: z.enum(['mock', 'unconfigured']).default('mock'),
  VERIFICATION_HASH_KEY: z.string().default('dev-only-verification-key'),
  NOTIFY_MODE: z.enum(['dev', 'unconfigured']).default('dev'),
  DEV_NOTIFY_FAIL_CHANNEL: z.enum(['', 'EMAIL', 'WHATSAPP']).default(''),
  SIM_AUTOPAY_OUTCOME: z.enum(['SUCCEEDED', 'FAILED', 'PENDING']).default('SUCCEEDED'),
  DEV_TOOLS_ENABLED: bool('true'),
  SEED_ON_START: bool('false'),
  JOBS_ENABLED: bool('true'),
  RATE_LIMIT_ENABLED: bool('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // TODO(group1): delete when Group 1 merges (OQ-01).
  GROUP1_SCHEMA: z.enum(['migrations', 'fixture', 'external']).default('migrations'),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const c = parsed.data;
  const isProduction = c.NODE_ENV === 'production';
  if (isProduction && c.SESSION_SECRET.startsWith('dev-only')) {
    throw new Error('Invalid configuration: SESSION_SECRET must be set in production');
  }
  if (isProduction && c.SESSION_SECRET.length < 32) {
    throw new Error('Invalid configuration: SESSION_SECRET must be at least 32 characters in production');
  }
  if (isProduction && c.GROUP1_SCHEMA === 'fixture') {
    throw new Error('Invalid configuration: GROUP1_SCHEMA=fixture is not allowed in production');
  }
  return Object.freeze({
    env: c.NODE_ENV,
    isProduction,
    isTest: c.NODE_ENV === 'test',
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    databasePoolMax: c.DATABASE_POOL_MAX,
    sessionSecret: c.SESSION_SECRET,
    corsOrigin: c.CORS_ORIGIN,
    timezone: c.APP_TIMEZONE,
    uploadDir: c.UPLOAD_DIR,
    maxUploadBytes: c.MAX_UPLOAD_BYTES,
    reservationHoldMinutes: c.RESERVATION_HOLD_MINUTES,
    autopayPendingTimeoutHours: c.AUTOPAY_PENDING_TIMEOUT_HOURS,
    pricingCombinationMode: c.PRICING_COMBINATION_MODE,
    defaultLowStockThreshold: c.DEFAULT_LOW_STOCK_THRESHOLD,
    fundraiserAtRiskTolerancePct: c.FUNDRAISER_AT_RISK_TOLERANCE_PCT,
    collegeVerificationMode: c.COLLEGE_VERIFICATION_MODE,
    verificationHashKey: c.VERIFICATION_HASH_KEY,
    notifyMode: c.NOTIFY_MODE,
    devNotifyFailChannel: c.DEV_NOTIFY_FAIL_CHANNEL || null,
    simAutopayOutcome: c.SIM_AUTOPAY_OUTCOME,
    // Dev tools are never available in production, whatever the flag says.
    devToolsEnabled: c.DEV_TOOLS_ENABLED && !isProduction,
    seedOnStart: c.SEED_ON_START && !isProduction,
    jobsEnabled: c.JOBS_ENABLED,
    rateLimitEnabled: c.RATE_LIMIT_ENABLED,
    logLevel: c.LOG_LEVEL,
    group1Schema: c.GROUP1_SCHEMA,
  });
}
