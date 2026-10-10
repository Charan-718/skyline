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

import { createLedgerRepository, createLedgerService } from './modules/finance/ledger/index.js';

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

import { createEventReportService, createReportingRoutes } from './modules/reporting/index.js';

import { createMembershipExpiryJob } from './jobs/definitions/membershipExpiry.js';
import { createRenewalRemindersJob } from './jobs/definitions/renewalReminders.js';
import { createAutopayRenewalsJob } from './jobs/definitions/autopayRenewals.js';
import { createReservationExpiryJob } from './jobs/definitions/reservationExpiry.js';

export function createContainer() {
  const auditRepository = createAuditRepository(db);
  const authz = createClubAuthz({ db });

  const verificationAdapter =
    config.COLLEGE_VERIFICATION_MODE === 'mock'
      ? createMockCollegeVerificationAdapter()
      : createUnconfiguredCollegeVerificationAdapter();

  const clubRepository = createClubRepository({ db });
  const authRepository = createAuthRepository({ db });

  const clubService = createClubService({ clubRepository, authRepository, auditRepository, authz });

  const authService = createAuthService({
    authRepository,
    verificationAdapter,
    clubsModule: clubService,
    auditRepository,
  });

  const ledgerRepository = createLedgerRepository({ db });
  const ledgerService = createLedgerService({ ledgerRepository });

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
    clubs: createClubRoutes({ clubController, authz }),
    payments: createPaymentRoutes({ paymentController }),
    memberships: createMembershipRoutes({ membershipController, authz }),
    events: createEventRoutes({ eventController, authz }),
    announcements: createAnnouncementRoutes({ announcementController, authz }),
    reporting: createReportingRoutes({ eventReportService, authz, eventRepository }),
  };

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
