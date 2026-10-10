import request from 'supertest';
import { loadConfig } from '../../src/config/index.js';
import { createContainer } from '../../src/container.js';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/shared/logger.js';
import { createTestDb, testDatabaseUrl } from './testDb.js';
import { createTestClock } from './testClock.js';
import { createGroup1Fakes } from './group1Fakes.js';
import { createRecordingHandlers } from './recordingHandlers.js';

// Builds the real app against soms_test with the test clock, Group 1 fakes and recording
// payment handlers. Adds one test-only route, POST /api/v1/__test/sign-in {userId}, standing
// in for Group 1's login (OQ-28). It exists only here, never in src/.

export function testConfig(overrides = {}) {
  return loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    GROUP1_SCHEMA: 'fixture',
    RATE_LIMIT_ENABLED: 'false',
    DEV_TOOLS_ENABLED: 'true',
    LOG_LEVEL: 'silent',
    UPLOAD_DIR: process.env.TEST_UPLOAD_DIR ?? '/tmp/soms-test-uploads',
    ...overrides,
  });
}

export function buildTestContext({ configOverrides, logger, handlerOptions, paymentHandlers, extraRoutes, group1Overrides, storage, notificationAdapters } = {}) {
  const config = testConfig(configOverrides);
  const db = createTestDb();
  const clock = createTestClock();
  const log = logger ?? createLogger({ level: 'silent' });

  let recording = null;
  const container = createContainer({
    config,
    db,
    logger: log,
    clock,
    group1: createGroup1Fakes(db, group1Overrides),
    storage,
    notificationAdapters,
    paymentHandlers: paymentHandlers ?? [],
  });
  if (!paymentHandlers) {
    recording = createRecordingHandlers(container.finance.ledger, handlerOptions);
    for (const h of recording.handlers) container.finance.payments.registerHandler(h);
  }

  const app = createApp(container, {
    beforeRoutes(router) {
      router.post('/__test/sign-in', async (req, res) => {
        await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
        req.session.userId = req.body.userId;
        res.status(204).end();
      });
      extraRoutes?.(router);
    },
  });

  async function signIn(userId) {
    const agent = request.agent(app);
    await agent.post('/api/v1/__test/sign-in').set('X-Requested-With', 'soms').send({ userId }).expect(204);
    return agent;
  }

  return { config, db, clock, container, app, signIn, handlerCalls: recording?.calls ?? [], close: () => container.close() };
}

export const idemKey = () => crypto.randomUUID();
