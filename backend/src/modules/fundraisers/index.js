import { createFundraiserService } from './service.js';
import { createFundraiserController } from './controller.js';
import { createFundraiserRoutes } from './routes.js';

// Public API of the fundraisers module (M8).
export function createFundraisersModule(deps) {
  const fundraisers = createFundraiserService(deps);
  const controller = createFundraiserController({ fundraisers });
  return Object.freeze({
    service: fundraisers,
    getFundraiserRef: fundraisers.getFundraiserRef,
    routes: (routeDeps) => createFundraiserRoutes({ controller, ...routeDeps }),
  });
}
