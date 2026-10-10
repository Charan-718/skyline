import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as s from './schemas.js';

// LLD §4.7. Public catalogue reads use optionalAuth (caller-specific display price when signed in).

export function createMerchandiseRoutes({ controller, requireAuth, optionalAuth, idempotency, requireClubRole }) {
  const r = Router();
  const CH = ['CLUB_HEAD'];
  const CH_TR = ['CLUB_HEAD', 'TREASURER'];

  r.get('/clubs/:clubId/product-categories', validate({ params: s.clubIdParams }), controller.listCategories);
  r.post('/clubs/:clubId/product-categories', requireAuth, validate({ params: s.clubIdParams, body: s.categoryBody }), requireClubRole(CH), controller.createCategory);

  r.get('/clubs/:clubId/products', optionalAuth, validate({ params: s.clubIdParams, query: s.productsQuery }), controller.listProducts);
  r.get('/products/:productId', optionalAuth, validate({ params: s.productIdParams }), controller.getProduct);
  r.post('/clubs/:clubId/products', requireAuth, validate({ params: s.clubIdParams, body: s.createProductBody }), requireClubRole(CH), controller.createProduct);
  r.patch('/products/:productId', requireAuth, validate({ params: s.productIdParams, body: s.patchProductBody }), controller.updateProduct);
  r.post('/products/:productId/status', requireAuth, validate({ params: s.productIdParams, body: s.statusBody }), controller.setStatus);
  r.post('/products/:productId/variants', requireAuth, validate({ params: s.productIdParams, body: s.addVariantBody }), controller.addVariant);
  r.patch('/variants/:variantId', requireAuth, validate({ params: s.variantIdParams, body: s.patchVariantBody }), controller.updateVariant);
  r.post('/variants/:variantId/stock-adjustments', requireAuth, idempotency(), validate({ params: s.variantIdParams, body: s.adjustmentBody }), controller.adjustStock);

  r.get('/clubs/:clubId/inventory', requireAuth, validate({ params: s.clubIdParams }), requireClubRole(CH_TR), controller.inventory);
  r.get('/clubs/:clubId/low-stock-alerts', requireAuth, validate({ params: s.clubIdParams, query: s.alertsQuery }), requireClubRole(CH_TR), controller.alerts);

  r.get('/clubs/:clubId/orders/quote', requireAuth, validate({ params: s.clubIdParams, query: s.quoteQuery }), controller.quote);
  r.post('/clubs/:clubId/orders', requireAuth, idempotency(), validate({ params: s.clubIdParams, body: s.placeOrderBody }), controller.placeOrder);
  r.post('/orders/:orderId/cancel', requireAuth, validate({ params: s.orderIdParams }), controller.cancelOrder);
  r.get('/me/orders', requireAuth, validate({ query: s.myOrdersQuery }), controller.myOrders);
  r.get('/me/orders/:orderId', requireAuth, validate({ params: s.orderIdParams }), controller.myOrder);
  r.get('/clubs/:clubId/orders', requireAuth, validate({ params: s.clubIdParams, query: s.ordersQuery }), requireClubRole(CH_TR), controller.clubOrders);
  r.post('/clubs/:clubId/pickups', requireAuth, idempotency(), validate({ params: s.clubIdParams, body: s.pickupBody }), requireClubRole(CH), controller.pickup);
  return r;
}
