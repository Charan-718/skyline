import { createWithTransaction } from '../db/transaction.js';
import { createAccess } from '../shared/access.js';
import { createRequireAuth, createOptionalAuth } from '../shared/middleware/actorAuth.js';
import { createAuthorize } from '../shared/middleware/clubRoleAuthorize.js';
import { createIdempotency } from '../shared/middleware/idempotencyG2.js';
import { csrfHeader } from '../shared/middleware/csrfHeader.js';
import { logger } from '../shared/logger.js';
import { createFinanceModule } from '../modules/finance/index.js';
import { createMerchandiseModule } from '../modules/merchandise/index.js';
import { createFundraisersModule } from '../modules/fundraisers/index.js';
import { createReportingModule } from '../modules/reporting/index.js';
import { createNotificationsModule } from '../modules/notifications/index.js';
import { createGroup1Bridge, createAppClock, toGroup2Config } from './group1Bridge.js';

/**
 * Group 2 routers (finance, merchandise, fundraisers, club reports) using live Group 1 data.
 * Payment simulate/get stay on Group 1 routes; finance ledger/expenses use Group 2 payments internally for merch.
 */
export function wireGroup2({ db, config, bridge: bridgeIn }) {
  const bridge = bridgeIn ?? createGroup1Bridge({ db, authRepository: null, authz: null });
  const g2Config = toGroup2Config(config);
  const clock = createAppClock();
  const withTransaction = createWithTransaction(db);
  const access = createAccess({ clubs: bridge.clubs, events: bridge.events });

  const routeDeps = Object.freeze({
    requireAuth: createRequireAuth({ auth: bridge.auth }),
    optionalAuth: createOptionalAuth({ auth: bridge.auth }),
    requireClubRole: createAuthorize({ access }),
    idempotency: createIdempotency({ db, clock, logger }),
    csrfHeader,
  });

  let fundraisers = null;
  const finance = createFinanceModule({
    db,
    withTransaction,
    clock,
    config: g2Config,
    logger,
    access,
    auth: bridge.auth,
    getEventClub: (eventId) => bridge.events.getEventClub(eventId),
    getFundraiserRef: (fundraiserId) => fundraisers.getFundraiserRef(fundraiserId),
  });

  const notifications = createNotificationsModule({
    db,
    clock,
    auth: bridge.auth,
    config: g2Config,
    logger,
  });

  const merchandise = createMerchandiseModule({
    db,
    withTransaction,
    clock,
    config: g2Config,
    access,
    auth: bridge.auth,
    clubs: bridge.clubs,
    pricing: bridge.pricing,
    memberships: bridge.memberships,
    payments: finance.payments,
    ledger: finance.ledger,
    notifications,
  });

  finance.payments.registerHandler(merchandise.paymentHandler);

  fundraisers = createFundraisersModule({
    db,
    clock,
    access,
    clubs: bridge.clubs,
    auth: bridge.auth,
    fundraiserMoney: finance.ledger.fundraiserMoney,
    timeZone: g2Config.timezone,
    tolerancePct: g2Config.fundraiserAtRiskTolerancePct,
  });

  const reporting = createReportingModule({
    db,
    financeSummary: (clubId, period) => finance.summary.summary(clubId, period),
    timeZone: g2Config.timezone,
  });

  const router = finance.financeRoutes(routeDeps);
  router.use(merchandise.routes(routeDeps));
  router.use(fundraisers.routes(routeDeps));
  router.use(reporting.routes(routeDeps));

  return Object.freeze({ router, routeDeps, finance, merchandise, fundraisers, notifications, bridge });
}
