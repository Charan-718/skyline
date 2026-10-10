export { createEventReportService } from './eventReport.js';
export { createReportingService } from './service.js';
export { createReportingController } from './controller.js';
export { createClubFinanceReportingRoutes } from './routesClub.js';

import { createEventReportingRoutes } from './routes.js';
import { createClubReportsRoutes } from './clubReports.js';
import { createReportingService } from './service.js';
import { createReportingController } from './controller.js';
import { createClubFinanceReportingRoutes } from './routesClub.js';

export { createEventReportingRoutes, createEventReportingRoutes as createReportingRoutes, createClubReportsRoutes };

export function createGroup1ReportingRoutes(deps) {
  const router = createEventReportingRoutes(deps);
  router.use(createClubReportsRoutes(deps));
  return router;
}

export function createReportingModule({ db, financeSummary, timeZone }) {
  const reporting = createReportingService({ db, financeSummary, timeZone });
  const controller = createReportingController({ reporting });
  return Object.freeze({
    service: reporting,
    routes: (deps) => createClubFinanceReportingRoutes({ controller, ...deps }),
  });
}
