import express from 'express';
import helmet from 'helmet';
import { requestId } from './shared/middleware/requestId.js';
import { requestLogger } from './shared/middleware/requestLogger.js';
import { cors } from './shared/middleware/cors.js';
import { csrfHeader } from './shared/middleware/csrfHeader.js';
import { createSession } from './shared/middleware/session.js';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler.js';

// Express app factory (LLD §1.1), used by server.js and tests. Base path /api/v1 (LLD §4).
// `beforeRoutes(router, container)` lets the test harness mount test-only routes; production
// code never passes it.

function health(db, logger) {
  return async (req, res) => {
    try {
      await db.raw('select 1');
      res.json({ status: 'ok', db: 'ok' });
    } catch (err) {
      logger.warn({ requestId: req.id, err }, 'health check failed');
      res.status(503).json({ status: 'error', db: 'down' });
    }
  };
}

export function createApp(container, { beforeRoutes } = {}) {
  const { config, logger, db } = container;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use(requestId());
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors(config.corsOrigin));
  app.get('/api/v1/health', health(db, logger));

  app.use(container.rateLimits.global);
  app.use(express.json({ limit: '100kb' }));
  app.use(createSession({ pool: container.sessionPool, secret: config.sessionSecret, isProduction: config.isProduction }));
  app.use(csrfHeader());

  const api = express.Router();
  beforeRoutes?.(api, container);
  const routeDeps = {
    requireAuth: container.requireAuth,
    optionalAuth: container.optionalAuth,
    idempotency: container.idempotency,
    requireClubRole: container.requireClubRole,
  };
  api.use(container.finance.routes(routeDeps));
  api.use(container.fundraisers.routes(routeDeps));
  api.use(container.reporting.routes(routeDeps));
  api.use(container.merchandise.routes(routeDeps));
  api.use(
    container.dev.routes([
      container.finance.devRoutes(routeDeps),
      container.notifications.devRoutes(routeDeps),
      container.jobDevRoutes(routeDeps),
    ]),
  );
  app.use('/api/v1', api);

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
