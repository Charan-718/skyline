import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.isTest ? 'silent' : 'info',
  redact: {
    paths: [
      'password',
      'passwordHash',
      'req.headers.cookie',
      'req.headers.authorization',
      'studentIdentifier',
      'qrPayload',
      'qrToken',
      'phoneE164',
      'destination',
    ],
    remove: true,
  },
});
