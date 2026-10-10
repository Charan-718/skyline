import { err, matchesQ, nowIso, paginate, quoteMerchItem, uid } from '../domain';
import { audit, evaluateLowStock, moveStock, placeOrder, settlePayment } from '../ops';
import { clubOf, created, findOr404, hasRole, ok, paged, requireClubRole, requireUser, userName } from './shared';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ONE_SIZE'];

function variantView(v) {
  const available = v.stockOnHand - v.stockReserved;
  return { ...v, available, orderable: v.isActive && available > 0 };
}

function productView(db, p, user) {
  const variants = db.variants.filter((v) => v.productId === p.id).map(variantView);
  const quote = quoteMerchItem(db, p, user?.id);
  return {
    ...p,
    categoryName: db.categories.find((c) => c.id === p.categoryId)?.name,
    clubName: clubOf(db, p.clubId)?.name,
    variants,
    totalAvailable: variants.reduce((s, v) => s + v.available, 0),
    offerActive: p.offerPricePaise != null && p.offerStartsAt <= nowIso() && nowIso() <= p.offerEndsAt,
    displayPrice: quote,
  };
}

function orderView(db, o) {
  const items = db.orderItems.filter((i) => i.orderId === o.id);
  const payment = db.payments.filter((p) => p.orderId === o.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const u = db.users.find((x) => x.id === o.userId);
  return { ...o, clubName: clubOf(db, o.clubId)?.name, buyerName: u?.fullName, buyerEmail: u?.email, items, itemCount: items.reduce((s, i) => s + i.quantity, 0), paymentStatus: payment?.status, paymentId: payment?.id, pickupCode: ['CONFIRMED', 'PICKED_UP'].includes(o.status) ? o.pickupCode : null, pickedUpByName: userName(db, o.pickedUpBy) };
}

function resolveClubId(db, clubId) {
  const c = db.clubs.find((x) => x.id === clubId || x.slug === clubId);
  return c ? c.id : clubId;
}

function parseItems(db, clubId, user, items) {
  if (!items.length) throw err(400, 'VALIDATION_FAILED', 'Your cart is empty.');
  if (items.length > 10) throw err(400, 'TOO_MANY_ITEMS', 'An order can have at most 10 lines.');
  const targetId = resolveClubId(db, clubId);
  return items.map(({ variantId, quantity }) => {
    const variant = db.variants.find((v) => v.id === variantId && (v.clubId === targetId || v.clubId === clubId));
    const product = variant && db.products.find((p) => p.id === variant.productId);
    if (!variant || !product || product.status !== 'ACTIVE' || !variant.isActive) throw err(422, 'PRODUCT_NOT_ORDERABLE', 'One of the items is no longer available.', { variantId });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw err(400, 'VALIDATION_FAILED', 'Quantity must be 1–10.');
    const quote = quoteMerchItem(db, product, user?.id);
    if (!quote.eligible) throw err(422, 'MEMBERS_ONLY_PRODUCT', `${product.name} is for club members only.`, { variantId });
    const available = variant.stockOnHand - variant.stockReserved;
    return { variant, product, quantity, quote, available };
  });
}

export const routes = [
  ['GET', '/clubs/:clubId/product-categories', ({ db, params }) => {
    const targetId = resolveClubId(db, params.clubId);
    return ok(db.categories.filter((c) => c.clubId === targetId));
  }],
  ['POST', '/clubs/:clubId/product-categories', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const name = String(ctx.body.name || '').trim();
    if (!name) throw err(400, 'VALIDATION_FAILED', 'Enter a category name.', { fields: { name: 'Required.' } });
    if (ctx.db.categories.some((c) => c.clubId === ctx.params.clubId && c.name.toLowerCase() === name.toLowerCase())) throw err(409, 'CATEGORY_NAME_TAKEN', 'This category already exists.');
    const c = { id: uid('cat'), clubId: ctx.params.clubId, name };
    ctx.db.categories.push(c);
    return created(c);
  }],
  ['GET', '/clubs/:clubId/products', ({ db, user, params, query }) => {
    const targetId = resolveClubId(db, params.clubId);
    findOr404(db.clubs, targetId, 'Club');
    const head = user && hasRole(db, user.id, targetId, ['CLUB_HEAD', 'TREASURER']);
    return ok(db.products.filter((p) => p.clubId === targetId && (query.all === 'true' && head ? true : p.status === 'ACTIVE') && (!query.categoryId || p.categoryId === query.categoryId)).map((p) => productView(db, p, user)));
  }],
  ['GET', '/products/:productId', ({ db, user, params }) => {
    const p = findOr404(db.products, params.productId, 'Product');
    if (p.status !== 'ACTIVE' && !(user && hasRole(db, user.id, p.clubId, ['CLUB_HEAD']))) throw err(404, 'NOT_FOUND', 'Product not found.');
    return ok(productView(db, p, user));
  }],
  ['POST', '/clubs/:clubId/products', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const { db, body, params } = ctx;
    const f = {};
    if (!body.name || !body.name.trim()) f.name = 'Enter a product name.';
    if (!body.categoryId || !db.categories.some((c) => c.id === body.categoryId && c.clubId === params.clubId)) f.categoryId = 'Choose a category.';
    if (!Number.isInteger(body.pricePaise) || body.pricePaise <= 0) f.pricePaise = 'Price must be more than zero.';
    if (body.offerPricePaise != null && (body.offerPricePaise >= body.pricePaise || !body.offerStartsAt || !body.offerEndsAt || body.offerStartsAt >= body.offerEndsAt)) f.offerPricePaise = 'Offer must be below the price and have a valid start and end.';
    const variants = Array.isArray(body.variants) ? body.variants : [];
    if (!variants.length) f.variants = 'Add at least one size.';
    if (new Set(variants.map((v) => v.sizeLabel)).size !== variants.length) f.variants = 'Each size can be added once.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    const p = { id: uid('prd'), clubId: params.clubId, categoryId: body.categoryId, name: body.name.trim(), description: body.description || '', pricePaise: body.pricePaise, memberDiscountEligible: body.memberDiscountEligible !== false, availableToNonMembers: body.availableToNonMembers !== false, offerPricePaise: body.offerPricePaise ?? null, offerStartsAt: body.offerStartsAt || null, offerEndsAt: body.offerEndsAt || null, status: 'DRAFT', createdAt: nowIso() };
    db.products.push(p);
    variants.forEach((v) => {
      const row = { id: uid('var'), productId: p.id, clubId: p.clubId, sizeLabel: v.sizeLabel, stockOnHand: v.initialStock || 0, stockReserved: 0, lowStockThreshold: v.lowStockThreshold ?? 5, isActive: true };
      db.variants.push(row);
      moveStock(db, row, 'RESTOCK', row.stockOnHand, { reason: 'Initial stock', actorUserId: actor.id });
      evaluateLowStock(db, row);
    });
    audit(db, actor.id, 'PRODUCT_CREATED', 'product', p.id);
    return created(productView(db, p, actor));
  }],
  ['PATCH', '/products/:productId', (ctx) => {
    const p = findOr404(ctx.db.products, ctx.params.productId, 'Product');
    const actor = requireClubRole(ctx, p.clubId, ['CLUB_HEAD']);
    ['name', 'description', 'categoryId', 'pricePaise', 'memberDiscountEligible', 'availableToNonMembers', 'offerPricePaise', 'offerStartsAt', 'offerEndsAt'].forEach((k) => {
      if (ctx.body[k] !== undefined) p[k] = ctx.body[k];
    });
    if (!Number.isInteger(p.pricePaise) || p.pricePaise <= 0) throw err(400, 'VALIDATION_FAILED', 'Price must be more than zero.', { fields: { pricePaise: 'Must be > 0.' } });
    audit(ctx.db, actor.id, 'PRODUCT_UPDATED', 'product', p.id);
    return ok(productView(ctx.db, p, actor));
  }],
  ['POST', '/products/:productId/status', (ctx) => {
    const p = findOr404(ctx.db.products, ctx.params.productId, 'Product');
    const actor = requireClubRole(ctx, p.clubId, ['CLUB_HEAD']);
    const next = ctx.body.status;
    const allowed = { DRAFT: ['ACTIVE', 'ARCHIVED'], ACTIVE: ['INACTIVE', 'ARCHIVED'], INACTIVE: ['ACTIVE', 'ARCHIVED'], ARCHIVED: [] };
    if (!allowed[p.status]?.includes(next)) throw err(409, 'CONFLICT_STATE', `Cannot change a ${p.status.toLowerCase()} product to ${String(next).toLowerCase()}.`, { currentStatus: p.status });
    p.status = next;
    audit(ctx.db, actor.id, 'PRODUCT_STATUS', 'product', p.id, { status: next });
    return ok(productView(ctx.db, p, actor));
  }],
  ['POST', '/products/:productId/variants', (ctx) => {
    const p = findOr404(ctx.db.products, ctx.params.productId, 'Product');
    const actor = requireClubRole(ctx, p.clubId, ['CLUB_HEAD']);
    const { sizeLabel, initialStock = 0, lowStockThreshold = 5 } = ctx.body;
    if (!SIZES.includes(sizeLabel)) throw err(400, 'VALIDATION_FAILED', 'Choose a size.', { fields: { sizeLabel: 'Required.' } });
    if (ctx.db.variants.some((v) => v.productId === p.id && v.sizeLabel === sizeLabel)) throw err(409, 'SIZE_EXISTS', 'This size already exists.');
    const v = { id: uid('var'), productId: p.id, clubId: p.clubId, sizeLabel, stockOnHand: initialStock, stockReserved: 0, lowStockThreshold, isActive: true };
    ctx.db.variants.push(v);
    moveStock(ctx.db, v, 'RESTOCK', initialStock, { reason: 'Initial stock', actorUserId: actor.id });
    evaluateLowStock(ctx.db, v);
    return created(variantView(v));
  }],
  ['PATCH', '/variants/:variantId', (ctx) => {
    const v = findOr404(ctx.db.variants, ctx.params.variantId, 'Variant');
    requireClubRole(ctx, v.clubId, ['CLUB_HEAD']);
    if (ctx.body.lowStockThreshold !== undefined) {
      if (!Number.isInteger(ctx.body.lowStockThreshold) || ctx.body.lowStockThreshold < 0) throw err(400, 'VALIDATION_FAILED', 'Threshold must be zero or more.', { fields: { lowStockThreshold: '≥ 0' } });
      v.lowStockThreshold = ctx.body.lowStockThreshold;
    }
    if (ctx.body.isActive !== undefined) v.isActive = !!ctx.body.isActive;
    evaluateLowStock(ctx.db, v);
    return ok(variantView(v));
  }],
  ['POST', '/variants/:variantId/stock-adjustments', (ctx) => {
    const v = findOr404(ctx.db.variants, ctx.params.variantId, 'Variant');
    const actor = requireClubRole(ctx, v.clubId, ['CLUB_HEAD']);
    const { type, quantity, reason } = ctx.body;
    const f = {};
    if (!['RESTOCK', 'ADJUSTMENT'].includes(type)) f.type = 'Choose restock or adjustment.';
    if (!Number.isInteger(quantity) || quantity === 0 || (type === 'RESTOCK' && quantity < 0)) f.quantity = type === 'RESTOCK' ? 'Restock quantity must be positive.' : 'Enter a non-zero quantity.';
    if (!reason || !String(reason).trim()) f.reason = 'Give a reason for the audit log.';
    if (Object.keys(f).length) throw err(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', { fields: f });
    if (v.stockOnHand + quantity < v.stockReserved) throw err(422, 'STOCK_BELOW_RESERVED', `Stock cannot go below the ${v.stockReserved} units reserved by unpaid orders.`, { fields: { quantity: `Minimum resulting stock is ${v.stockReserved}.` } });
    v.stockOnHand += quantity;
    moveStock(ctx.db, v, type, quantity, { reason, actorUserId: actor.id });
    evaluateLowStock(ctx.db, v);
    audit(ctx.db, actor.id, 'STOCK_ADJUSTED', 'variant', v.id, { type, quantity, reason });
    return ok(variantView(v));
  }],
  ['GET', '/clubs/:clubId/inventory', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db } = ctx;
    return ok(db.products.filter((p) => p.clubId === ctx.params.clubId && p.status !== 'ARCHIVED').flatMap((p) => db.variants.filter((v) => v.productId === p.id).map((v) => ({
      ...variantView(v), productName: p.name, productStatus: p.status, alertOpen: db.alerts.some((a) => a.variantId === v.id && a.status === 'OPEN'),
      lastMovements: db.movements.filter((m) => m.variantId === v.id).slice(-5).reverse(),
    }))));
  }],
  ['GET', '/clubs/:clubId/low-stock-alerts', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db, query } = ctx;
    return ok(db.alerts.filter((a) => a.clubId === ctx.params.clubId && (!query.status || a.status === query.status)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((a) => {
      const v = db.variants.find((x) => x.id === a.variantId);
      return { ...a, productName: db.products.find((p) => p.id === a.productId)?.name, sizeLabel: v?.sizeLabel, availableNow: v ? v.stockOnHand - v.stockReserved : null };
    }));
  }],
  ['GET', '/clubs/:clubId/orders/quote', (ctx) => {
    const user = requireUser(ctx);
    const targetId = resolveClubId(ctx.db, ctx.params.clubId);
    const items = String(ctx.query.items || '').split(',').filter(Boolean).map((s) => {
      const [variantId, q] = s.split(':');
      return { variantId, quantity: parseInt(q, 10) };
    });
    const lines = parseItems(ctx.db, targetId, user, items);
    return ok({
      lines: lines.map((l) => ({ variantId: l.variant.id, productName: l.product.name, sizeLabel: l.variant.sizeLabel, quantity: l.quantity, available: l.available, ...l.quote, lineTotalPaise: l.quote.finalPricePaise * l.quantity })),
      totalPaise: lines.reduce((s, l) => s + l.quote.finalPricePaise * l.quantity, 0),
      savingsPaise: lines.reduce((s, l) => s + l.quote.discountPaise * l.quantity, 0),
    });
  }],
  ['POST', '/clubs/:clubId/orders', (ctx) => {
    const user = requireUser(ctx);
    const { db, body, params } = ctx;
    const targetId = resolveClubId(db, params.clubId);
    const lines = parseItems(db, targetId, user, body.items || []);
    const total = lines.reduce((s, l) => s + l.quote.finalPricePaise * l.quantity, 0);
    if (body.expectedTotalPaise !== total) throw err(409, 'PRICE_CHANGED', 'Prices in your cart changed. Review the new total and confirm.', { totalPaise: total });
    const { order, payment } = placeOrder(db, { userId: user.id, clubId: targetId, lines });
    return created({ order: orderView(db, order), payment });
  }],
  ['POST', '/orders/:orderId/cancel', (ctx) => {
    const user = requireUser(ctx);
    const o = ctx.db.orders.find((x) => x.id === ctx.params.orderId && x.userId === user.id);
    if (!o) throw err(404, 'NOT_FOUND', 'Order not found.');
    if (o.status !== 'PENDING_PAYMENT') throw err(409, 'CONFLICT_STATE', 'Only unpaid orders can be cancelled.', { currentStatus: o.status });
    settlePayment(ctx.db, ctx.db.payments.find((p) => p.orderId === o.id && ['INITIATED', 'PENDING'].includes(p.status)), 'FAILED', { reason: 'USER_CANCELLED' });
    return ok(orderView(ctx.db, o));
  }],
  ['GET', '/me/orders', (ctx) => {
    const user = requireUser(ctx);
    return paged(paginate(ctx.db.orders.filter((o) => o.userId === user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((o) => orderView(ctx.db, o)), ctx.query));
  }],
  ['GET', '/me/orders/:orderId', (ctx) => {
    const user = requireUser(ctx);
    const o = ctx.db.orders.find((x) => x.id === ctx.params.orderId && x.userId === user.id);
    if (!o) throw err(404, 'NOT_FOUND', 'Order not found.');
    return ok({ ...orderView(ctx.db, o), payments: ctx.db.payments.filter((p) => p.orderId === o.id) });
  }],
  ['GET', '/clubs/:clubId/orders', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db, query } = ctx;
    const rows = db.orders.filter((o) => o.clubId === ctx.params.clubId && (!query.status || o.status === query.status)).map((o) => orderView(db, o)).filter((o) => matchesQ(query.q, o.buyerName, o.buyerEmail, o.pickupCode, o.id)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return paged(paginate(rows, query));
  }],
  ['POST', '/clubs/:clubId/pickups', (ctx) => {
    const actor = requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD']);
    const codeIn = String(ctx.body.pickupCode || '').trim().toUpperCase();
    const o = ctx.db.orders.find((x) => x.clubId === ctx.params.clubId && x.pickupCode === codeIn);
    if (!o) throw err(404, 'PICKUP_CODE_NOT_FOUND', 'No order in this club has that pickup code.');
    if (o.status === 'PICKED_UP') throw err(409, 'ALREADY_PICKED_UP', 'This order was already collected.', { pickedUpAt: o.pickedUpAt, pickedUpByName: userName(ctx.db, o.pickedUpBy) });
    if (o.status !== 'CONFIRMED') throw err(409, 'ORDER_NOT_READY', 'This order is not paid yet.');
    o.status = 'PICKED_UP';
    o.pickedUpAt = nowIso();
    o.pickedUpBy = actor.id;
    audit(ctx.db, actor.id, 'ORDER_PICKED_UP', 'order', o.id);
    return ok(orderView(ctx.db, o));
  }],
  ['GET', '/clubs/:clubId/reports/merchandise', (ctx) => {
    requireClubRole(ctx, ctx.params.clubId, ['CLUB_HEAD', 'TREASURER']);
    const { db } = ctx;
    const orders = db.orders.filter((o) => o.clubId === ctx.params.clubId);
    const soldIds = new Set(orders.filter((o) => ['CONFIRMED', 'PICKED_UP'].includes(o.status)).map((o) => o.id));
    const units = {};
    db.orderItems.filter((i) => soldIds.has(i.orderId)).forEach((i) => {
      const k = `${i.productName}|${i.sizeLabel}`;
      units[k] = units[k] || { productName: i.productName, sizeLabel: i.sizeLabel, units: 0, revenuePaise: 0 };
      units[k].units += i.quantity;
      units[k].revenuePaise += i.lineTotalPaise;
    });
    const byStatus = orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {});
    return ok({
      unitsSold: Object.values(units).sort((a, b) => b.units - a.units),
      revenuePaise: db.ledger.filter((l) => l.clubId === ctx.params.clubId && l.category === 'MERCH_SALE').reduce((s, l) => s + l.amountPaise, 0),
      ordersByStatus: byStatus,
      openAlerts: db.alerts.filter((a) => a.clubId === ctx.params.clubId && a.status === 'OPEN').length,
    });
  }],
];
