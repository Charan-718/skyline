import { db } from './db/knex.js';
import { config } from './config/index.js';
import { now } from './shared/clock.js';
import { createAuditRepository } from './shared/auditRepository.js';
import { createPricingPolicy } from './modules/pricing/PricingPolicy.js';

import {
  createAuthRepository,
  createAuthService,
  createAuthController,
  createAuthRoutes,
  createMockCollegeVerificationAdapter,
  createUnconfiguredCollegeVerificationAdapter,
} from './modules/auth/index.js';
import { createCollegeRosterRepository } from './modules/collegeRoster/repository.js';
import { createDbCollegeVerificationAdapter } from './modules/collegeRoster/DbCollegeVerificationAdapter.js';
import { createCollegeRosterDevRoutes } from './modules/collegeRoster/devRoutes.js';

import {
  createClubRepository,
  createClubService,
  createClubController,
  createClubRoutes,
  createClubAuthz,
} from './modules/clubs/index.js';

import {
  createPaymentRepository,
  createPaymentService,
  createPaymentHandlerRegistry,
  createPaymentController,
  createPaymentRoutes,
} from './modules/finance/payments/index.js';

import { createLedgerService } from './modules/finance/ledger/index.js';
import { logger } from './shared/logger.js';
import { createGroup1Bridge } from './integration/group1Bridge.js';
import { wireGroup2 } from './integration/wireGroup2.js';

import { createNotificationRepository, createNotificationService } from './modules/notifications/index.js';

import {
  createMembershipRepository,
  createMembershipService,
  createPlansService,
  createMembershipController,
  createMembershipRoutes,
  createMembershipPaymentHandler,
  createMembershipRenewalPaymentHandler,
} from './modules/memberships/index.js';

import {
  createEventRepository,
  createEventService,
  createEventController,
  createEventRoutes,
  createTicketPaymentHandler,
} from './modules/events/index.js';

import {
  createAnnouncementRepository,
  createAnnouncementService,
  createAnnouncementController,
  createAnnouncementRoutes,
} from './modules/announcements/index.js';

import { createEventReportService, createGroup1ReportingRoutes } from './modules/reporting/index.js';

import { createMembershipExpiryJob } from './jobs/definitions/membershipExpiry.js';
import { createRenewalRemindersJob } from './jobs/definitions/renewalReminders.js';
import { createAutopayRenewalsJob } from './jobs/definitions/autopayRenewals.js';
import { createReservationExpiryJob } from './jobs/definitions/reservationExpiry.js';

export function createContainer() {
  const auditRepository = createAuditRepository(db);
  const authz = createClubAuthz({ db });

  const collegeRosterRepository = createCollegeRosterRepository({ db });

  const verificationAdapter =
    config.COLLEGE_VERIFICATION_MODE === 'mock'
      ? createMockCollegeVerificationAdapter()
      : config.COLLEGE_VERIFICATION_MODE === 'database'
        ? createDbCollegeVerificationAdapter({ collegeRosterRepository })
        : createUnconfiguredCollegeVerificationAdapter();

  const clubRepository = createClubRepository({ db });
  const authRepository = createAuthRepository({ db });

  const clubService = createClubService({
    clubRepository,
    authRepository,
    auditRepository,
    authz,
    collegeRosterRepository,
  });

  const authService = createAuthService({
    authRepository,
    verificationAdapter,
    clubsModule: clubService,
    auditRepository,
    collegeRosterRepository,
  });

  const ledgerService = createLedgerService({ db, logger });
  const group1Bridge = createGroup1Bridge({ db, authRepository, authz });

  const notificationRepository = createNotificationRepository({ db });
  const notificationService = createNotificationService({ notificationRepository });

  const paymentRepository = createPaymentRepository({ db });
  const handlerRegistry = createPaymentHandlerRegistry();

  const membershipRepository = createMembershipRepository({ db });

  const paymentService = createPaymentService({
    paymentRepository,
    handlerRegistry,
    ledgerService,
    config,
    db,
  });

  const membershipService = createMembershipService({
    membershipRepository,
    paymentService,
    authService,
    authz,
    clubRepository,
  });

  handlerRegistry.register(
    createMembershipPaymentHandler({
      membershipRepository,
      clubRepository,
      ledgerService,
      notificationService,
    }),
  );
  handlerRegistry.register(
    createMembershipRenewalPaymentHandler({
      membershipRepository,
      clubRepository,
      ledgerService,
      notificationService,
    }),
  );

  const eventRepository = createEventRepository({ db });

  handlerRegistry.register(
    createTicketPaymentHandler({
      eventRepository,
      ledgerService,
      notificationService,
      authService,
    }),
  );

  const pricingPolicy = createPricingPolicy(now, config.PRICING_COMBINATION_MODE);

  const eventService = createEventService({
    eventRepository,
    membershipService,
    pricingPolicy,
    paymentService,
    authz,
    config,
  });

  const plansService = createPlansService({ membershipRepository, authz, authService });

  const announcementRepository = createAnnouncementRepository({ db });
  const announcementService = createAnnouncementService({
    announcementRepository,
    membershipRepository,
    eventRepository,
    authRepository,
    notificationService,
    authz,
  });

  const eventReportService = createEventReportService({ db });

  const authController = createAuthController({ authService });
  const clubController = createClubController({ clubService });
  const paymentController = createPaymentController({ paymentService });
  const membershipController = createMembershipController({ membershipService, plansService });
  const eventController = createEventController({ eventService });
  const announcementController = createAnnouncementController({ announcementService });

  const routes = {
    auth: createAuthRoutes({ authController }),
    collegeRosterDev:
      config.devToolsEnabled && config.COLLEGE_VERIFICATION_MODE === 'database'
        ? createCollegeRosterDevRoutes({ collegeRosterRepository, config })
        : null,
    clubs: createClubRoutes({ clubController, authz }),
    payments: createPaymentRoutes({ paymentController }),
    memberships: createMembershipRoutes({ membershipController, authz }),
    events: createEventRoutes({ eventController, authz }),
    announcements: createAnnouncementRoutes({ announcementController, authz }),
    reporting: createGroup1ReportingRoutes({ db, eventReportService, authz, eventRepository }),
  };

  const group2 = wireGroup2({ db, config, bridge: group1Bridge });
  routes.group2 = group2.router;

  const jobs = {
    membershipExpiry: createMembershipExpiryJob({ db }),
    renewalReminders: createRenewalRemindersJob({ db, notificationService }),
    autopayRenewals: createAutopayRenewalsJob({
      db,
      membershipRepository,
      paymentService,
      authService,
      notificationService,
    }),
    reservationExpiry: createReservationExpiryJob({ db, paymentService }),
  };

  return {
    db,
    config,
    routes,
    jobs,
    services: {
      authService,
      clubService,
      membershipService,
      eventService,
      paymentService,
      announcementService,
    },
  };
}
