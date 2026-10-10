import pino from 'pino';

// LLD §9 redaction list, plus session identifiers (master prompt §4 Logging).
// pino wildcards match one level, so each key is listed at the depths we log objects.
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'password_hash',
  'cookie',
  'authorization',
  'set-cookie',
  'studentIdentifier',
  'student_identifier',
  'qrPayload',
  'qrToken',
  'qr_token',
  'phoneE164',
  'phone_e164',
  'destination',
  'sid',
  'sessionId',
  'session',
];

function redactPaths(keys, depth = 4) {
  const paths = [];
  for (const key of keys) {
    const k = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
    let prefix = '';
    for (let d = 0; d < depth; d += 1) {
      paths.push(prefix ? `${prefix}${k.startsWith('[') ? k : `.${k}`}` : k);
      prefix = prefix ? `${prefix}.*` : '*';
    }
  }
  return paths;
}

export const REDACT_PATHS = redactPaths(SENSITIVE_KEYS);

export function createLogger({ level = 'info', destination } = {}) {
  return pino(
    {
      level,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}
