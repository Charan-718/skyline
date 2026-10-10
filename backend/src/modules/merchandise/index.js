import { createCatalogueService } from './catalogue/service.js';
import { createStockService } from './stock/service.js';
import { createOrderService } from './orders/service.js';
import { createOrderPaymentHandler } from './handlers/orderPaymentHandler.js';
import { createMerchandiseController } from './controller.js';
import { createMerchandiseRoutes } from './routes.js';

// Public API of the merchandise module (M7). Consumes Group 1 interfaces pricing.quoteMerchItem,
// memberships.getActiveBenefits, clubs.listRoleHolders (TODO(group1) stubs until Group 1 merges)
// and Group 2's payments, ledger and notifications.

export function createMerchandiseModule({ db, withTransaction, clock, config, access, auth, clubs, pricing, memberships, payments, ledger, notifications }) {
  const stock = createStockService({ db, withTransaction, clock, access, clubs, notifications });
  const catalogue = createCatalogueService({ db, withTransaction, clock, access, pricing, memberships, stock, config });
  const orders = createOrderService({ db, withTransaction, clock, auth, pricing, memberships, payments, stock, config });
  const controller = createMerchandiseController({ catalogue, stock, orders });
  return Object.freeze({
    paymentHandler: createOrderPaymentHandler({ ledger, stock, clock }),
    evaluateLowStock: stock.evaluate,
    routes: (deps) => createMerchandiseRoutes({ controller, ...deps }),
  });
}
