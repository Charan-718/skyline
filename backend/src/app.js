import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config/index.js';
import { logger } from './shared/logger.js';
import { requestIdMiddleware } from './shared/middleware/requestId.js';
import { createSessionMiddleware } from './shared/middleware/session.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { globalRateLimit } from './shared/middleware/rateLimits.js';
import { db } from './db/knex.js';

export function createApp(container) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);
  app.use(pinoHttp({ logger }));
  app.use(globalRateLimit);
  app.use(createSessionMiddleware());

  app.get('/api/v1/health', async (_req, res) => {
    try {
      await db.raw('SELECT 1');
      res.json({ data: { status: 'ok', db: 'ok' } });
    } catch {
      res.status(503).json({ data: { status: 'degraded', db: 'error' } });
    }
  });

  const api = express.Router();
  Object.values(container.routes).forEach((router) => api.use(router));
  app.use('/api/v1', api);

  app.use(errorHandler);

  return app;
}
