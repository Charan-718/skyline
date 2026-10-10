import { afterAll, beforeAll, describe, it } from 'vitest';
import { buildTestContext, idemKey } from '../helpers/testApp.js';
import { truncateAll } from '../helpers/testDb.js';
import { pay, placeOrder } from '../helpers/merch.js';
import { makeProduct } from '../fixtures/factories.js';
import { expectStatus, makeCast, matrixRows } from '../helpers/authzMatrix.js';

// TC-AZ-01 rows for the merchandise endpoints (T-60…T-63) and the Step 4 dev endpoints.

describe('TC-AZ-01 — merchandise, outbox, jobs', () => {
  let ctx;
  let cast;
  let product;
  let variant;
  const H = { 'X-Requested-With': 'soms' };
  let n = 0;

  beforeAll(async () => {
    ctx = buildTestContext();
    await truncateAll(ctx.db);
    cast = await makeCast(ctx);
    const p = await makeProduct(ctx.db, cast.a, { pricePaise: 1000, variants: [{ size: 'M', stock: 1000 }] });
    product = p.product;
    variant = p.variants.M;
  });
  afterAll(() => ctx.close());

  const A = () => cast.a.club.id;
  // An order placed by VOL_A, for owner-scoped rows
  const volOrder = async () => (await placeOrder(cast.agents.VOL_A, A(), [{ variantId: variant.id, quantity: 1 }], 1000)).body.data;
  const confirmedCode = async () => {
    const o = await volOrder();
    return (await pay(cast.agents.VOL_A, o.payment.id)).body.data.result.pickupCode;
  };

  const endpoints = {
    'GET /clubs/:A/product-categories (public)': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/product-categories`) },
    'POST /clubs/:A/product-categories': { run: (ag) => ag.post(`/api/v1/clubs/${A()}/product-categories`).set(H).send({ name: `C${(n += 1)}` }) },
    'GET /clubs/:A/products (public)': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/products`) },
    'GET /clubs/:A/products?all=true': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/products?all=true`) },
    'POST /clubs/:A/products': {
      run: async (ag) => {
        const cat = (await cast.agents.CH_A.post(`/api/v1/clubs/${A()}/product-categories`).set(H).send({ name: `P${(n += 1)}` })).body.data;
        return ag.post(`/api/v1/clubs/${A()}/products`).set(H).send({ categoryId: cat.id, name: 'X', pricePaise: 100, variants: [{ sizeLabel: 'M', initialStock: 1 }] });
      },
    },
    'PATCH /products/:id': { run: (ag) => ag.patch(`/api/v1/products/${product.id}`).set(H).send({ description: 'd' }) },
    'POST /products/:id/status': { run: (ag) => ag.post(`/api/v1/products/${product.id}/status`).set(H).send({ status: 'ACTIVE' }) },
    'POST /products/:id/variants': { run: (ag) => ag.post(`/api/v1/products/${product.id}/variants`).set(H).send({ sizeLabel: `Z${(n += 1)}`, initialStock: 0 }) },
    'PATCH /variants/:id': { run: (ag) => ag.patch(`/api/v1/variants/${variant.id}`).set(H).send({ lowStockThreshold: 0 }) },
    'POST /variants/:id/stock-adjustments': {
      run: (ag) => ag.post(`/api/v1/variants/${variant.id}/stock-adjustments`).set(H).set('Idempotency-Key', idemKey()).send({ type: 'RESTOCK', quantity: 1, reason: 'r' }),
    },
    'GET /clubs/:A/inventory': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/inventory`) },
    'GET /clubs/:A/low-stock-alerts': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/low-stock-alerts`) },
    'GET /clubs/:A/orders/quote': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/orders/quote?items=${variant.id}:1`) },
    'POST /clubs/:A/orders': { run: (ag) => placeOrder(ag, A(), [{ variantId: variant.id, quantity: 1 }], 1000) },
    'POST /orders/:id/cancel (VOL_A order)': { setup: volOrder, run: (ag, o) => ag.post(`/api/v1/orders/${o.order.id}/cancel`).set(H) },
    'GET /me/orders/:id (VOL_A order)': { setup: volOrder, run: (ag, o) => ag.get(`/api/v1/me/orders/${o.order.id}`) },
    'GET /me/orders': { run: (ag) => ag.get('/api/v1/me/orders') },
    'GET /clubs/:A/orders': { run: (ag) => ag.get(`/api/v1/clubs/${A()}/orders`) },
    'POST /clubs/:A/pickups': { setup: confirmedCode, run: (ag, code) => ag.post(`/api/v1/clubs/${A()}/pickups`).set(H).set('Idempotency-Key', idemKey()).send({ pickupCode: code }) },
    'GET /dev/outbox': { run: (ag) => ag.get('/api/v1/dev/outbox') },
    'POST /dev/jobs/notification-dispatch/run': { run: (ag) => ag.post('/api/v1/dev/jobs/notification-dispatch/run').set(H).send({}) },
  };

  const pub = { ANON: 200, AUTH_OTHER: 200, VOL_A: 200, TR_A: 200, CH_A: 200, ORG_A: 200, TR_B: 200, CH_B: 200 };
  const auth = (ok) => ({ ANON: 401, AUTH_OTHER: ok, VOL_A: ok, TR_A: ok, CH_A: ok, ORG_A: ok, TR_B: ok, CH_B: ok });
  const ch = (ok) => ({ ANON: 401, AUTH_OTHER: 404, VOL_A: 403, TR_A: 403, CH_A: ok, ORG_A: 403, TR_B: 404, CH_B: 404 });
  const chTr = (ok) => ({ ...ch(ok), TR_A: ok });
  const owner = (ok) => ({ ANON: 401, AUTH_OTHER: 404, VOL_A: ok, TR_A: 404, CH_A: 404, ORG_A: 404, TR_B: 404, CH_B: 404 });
  const matrix = {
    'GET /clubs/:A/product-categories (public)': pub,
    'POST /clubs/:A/product-categories': ch(201),
    'GET /clubs/:A/products (public)': pub,
    'GET /clubs/:A/products?all=true': ch(200),
    'POST /clubs/:A/products': ch(201),
    'PATCH /products/:id': ch(200),
    'POST /products/:id/status': { ...ch(409), CH_A: 409 }, // already ACTIVE → CONFLICT_STATE once authorised
    'POST /products/:id/variants': ch(201),
    'PATCH /variants/:id': ch(200),
    'POST /variants/:id/stock-adjustments': ch(200),
    'GET /clubs/:A/inventory': chTr(200),
    'GET /clubs/:A/low-stock-alerts': chTr(200),
    'GET /clubs/:A/orders/quote': auth(200),
    'POST /clubs/:A/orders': auth(201),
    'POST /orders/:id/cancel (VOL_A order)': owner(200),
    'GET /me/orders/:id (VOL_A order)': owner(200),
    'GET /me/orders': auth(200),
    'GET /clubs/:A/orders': chTr(200),
    'POST /clubs/:A/pickups': ch(200),
    'GET /dev/outbox': auth(200),
    'POST /dev/jobs/notification-dispatch/run': auth(200),
  };

  it.each(matrixRows(matrix))('%s as %s → %i', async (endpoint, actor, status) => {
    const e = endpoints[endpoint];
    const arg = e.setup ? await e.setup() : undefined;
    await expectStatus(await e.run(cast.agents[actor], arg), status);
  });
});
