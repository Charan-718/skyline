import { createReportingService } from './service.js';
import { createReportingRoutes } from './routes.js';
import { createReportingController } from './controller.js';

// Public API of the reporting module (M10): read-only.
export function createReportingModule({ db, financeSummary, timeZone }) {
  const reporting = createReportingService({ db, financeSummary, timeZone });
  const controller = createReportingController({ reporting });
  return Object.freeze({ service: reporting, routes: (deps) => createReportingRoutes({ controller, ...deps }) });
}
