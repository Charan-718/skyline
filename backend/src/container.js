import pg from 'pg';
import { createWithTransaction } from './db/transaction.js';
import { audit } from './shared/audit.js';
import { createIdempotency } from './shared/middleware/idempotency.js';
import { createRateLimits } from './shared/middleware/rateLimits.js';
import { createRequireAuth } from './shared/middleware/requireAuth.js';
import { createAuthorize } from './shared/middleware/authorize.js';
import * as authModule from './modules/auth/index.js';
import * as clubsModule from './modules/clubs/index.js';
import * as eventsModule from './modules/events/index.js';
import * as pricingModule from './modules/pricing/index.js';
import * as membershipsModule from './modules/memberships/index.js';
import { createFinanceModule } from './modules/finance/index.js';
import { createDevModule } from './modules/dev/index.js';
import { createFundraisersModule } from './modules/fundraisers/index.js';
import { createReportingModule } from './modules/reporting/index.js';
import { createNotificationsModule } from './modules/notifications/index.js';
import { createMerchandiseModule } from './modules/merchandise/index.js';
import { createJobRunner } from './jobs/runJob.js';
import { createJobRegistry } from './jobs/registry.js';
import { createReservationExpiryJob } from './jobs/definitions/reservationExpiry.js';
import { createNotificationDispatchJob } from './jobs/definitions/notificationDispatch.js';
import { createJobDevRoutes } from './jobs/devRoutes.js';
import { createOptionalAuth } from './shared/middleware/requireAuth.js';
import { createAccess } from './shared/access.js';

// Composition root (LLD §1.1): wires adapters, services and payment purpose handlers.
// `group1` lets tests supply working stand-ins for the Group 1 interfaces that are still
// TODO(group1) stubs (auth.getUser/getUsersByIds, clubs.hasClubRole, events.getEventClub/
// isClubEventOrganizer). `paymentHandlers` replaces the default
// handler set (tests register handlers that post to the ledger like the real ones will).

export function createContainer({ config, db, logger, clock, group1 = {}, paymentHandlers, storage, notificationAdapters } = {}) {
  const auth = group1.auth ?? authModule;
  const clubs = group1.clubs ?? clubsModule;
  const events = group1.events ?? eventsModule;
  const pricing = group1.pricing ?? pricingModule;
  const memberships = group1.memberships ?? membershipsModule;
  const withTransaction = createWithTransaction(db);
  const access = createAccess({ clubs, events });

  // fundraisers is created below; finance looks up a fundraiser's club through it lazily (OQ-25).
  let fundraisers = null;
  const finance = createFinanceModule({
    db,
    withTransaction,
    clock,
    config,
    logger,
    access,
    auth,
    getEventClub: (eventId) => events.getEventClub(eventId),
    getFundraiserRef: (fundraiserId) => fundraisers.getFundraiserRef(fundraiserId),
    storage,
  });

  const notifications = createNotificationsModule({ db, clock, auth, config, logger, adapters: notificationAdapters });
  const merchandise = createMerchandiseModule({
    db,
    withTransaction,
    clock,
    config,
    access,
    auth,
    clubs,
    pricing,
    memberships,
    payments: finance.payments,
    ledger: finance.ledger,
    notifications,
  });

  // Payment purpose handlers (LLD §2.10). MERCH_ORDER is Group 2's own handler and is always
  // registered. MEMBERSHIP_* are Group 1 stubs that record calls (TODO(group1)); EVENT_TICKET is
  // registered by Group 1 (T-43). `paymentHandlers` replaces the Group 1 set (tests).
  const membershipHandlers = membershipsModule.createMembershipPaymentHandlers();
  for (const handler of paymentHandlers ?? membershipHandlers.handlers) finance.payments.registerHandler(handler);
  finance.payments.registerHandler(merchandise.paymentHandler);

  // Jobs (LLD §7). Group 1 adds its daily jobs here.
  const runJob = createJobRunner({ db, clock, logger });
  const jobs = createJobRegistry({
    runJob,
    clock,
    timeZone: config.timezone,
    definitions: {
      'reservation-expiry': {
        cron: '* * * * *',
        daily: false,
        run: createReservationExpiryJob({ payments: finance.payments, withTransaction, config, logger }),
      },
      'notification-dispatch': { cron: '* * * * *', daily: false, run: createNotificationDispatchJob({ notifications }) },
    },
  });

  fundraisers = createFundraisersModule({
    db,
    clock,
    access,
    clubs,
    auth,
    fundraiserMoney: finance.ledger.fundraiserMoney,
    timeZone: config.timezone,
    tolerancePct: config.fundraiserAtRiskTolerancePct,
  });

  const reporting = createReportingModule({
    db,
    financeSummary: (clubId, period) => finance.summary.summary(clubId, period),
    timeZone: config.timezone,
  });

  const sessionPool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });

  return {
    config,
    db,
    logger,
    clock,
    withTransaction,
    audit,
    auth,
    clubs,
    events,
    access,
    finance,
    fundraisers,
    reporting,
    notifications,
    merchandise,
    jobs,
    runJob,
    jobDevRoutes: (deps) => createJobDevRoutes({ registry: jobs, ...deps }),
    dev: createDevModule({ config }),
    membershipHandlerCalls: membershipHandlers.calls,
    sessionPool,
    rateLimits: createRateLimits({ enabled: config.rateLimitEnabled }),
    requireAuth: createRequireAuth({ auth }),
    optionalAuth: createOptionalAuth({ auth }),
    requireClubRole: createAuthorize({ access }),
    idempotency: createIdempotency({ db, clock, logger }),
    async close() {
      await sessionPool.end();
      await db.destroy();
    },
  };
}
