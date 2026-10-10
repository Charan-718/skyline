import { appError } from '../../../shared/errors.js';
import { record as auditRecord } from '../../../shared/audit.js';
import { toOffset } from '../../../shared/pagination.js';
import { isOrderable, pricingView } from '../domain/productRules.js';
import { available } from '../domain/stockRules.js';
import { assertUnitQuote, lineProblems, pickupProblem, totals } from '../domain/orderRules.js';
import * as catalogue from '../catalogue/repository.js';
import * as stockRepo from '../stock/repository.js';
import * as repository from './repository.js';

// Orders, cancel, pickup (LLD §4.7, §5.9; T-62, T-63). Prices come only from Group 1's
// PricingPolicy; the client's expectedTotalPaise is compared, never charged (ADR-005).

export function createOrderService({ db, withTransaction, clock, auth, pricing, memberships, payments, stock, config }) {
  /** Server quote for the lines. checkStock adds the OUT_OF_STOCK pre-check used by GET quote. */
  async function computeQuote(actor, clubId, items, { checkStock }) {
    const problem = lineProblems(items);
    if (problem) throw appError(problem.code, problem.details);
    const rows = await catalogue.variantsWithProducts(db, clubId, items.map((i) => i.variantId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const benefits = await memberships.getActiveBenefits(actor.userId, clubId, clock.todayIST());
    const now = clock.now();
    const lines = [];
    for (const item of items) {
      const v = byId.get(item.variantId);
      if (!v) throw appError('NOT_FOUND', { variantId: item.variantId });
      if (!isOrderable(v.product, v)) throw appError('PRODUCT_NOT_ORDERABLE', { variantId: v.id });
      if (checkStock && available(v) < item.quantity) throw appError('OUT_OF_STOCK', { variantId: v.id, available: available(v) });
      const unit = assertUnitQuote(await pricing.quoteMerchItem(pricingView(v.product), benefits, now, { mode: config.pricingCombinationMode }));
      lines.push({ variantId: v.id, productId: v.product_id, quantity: item.quantity, unit, productName: v.product.name, sizeLabel: v.size_label });
    }
    const t = totals(lines);
    t.lines = t.lines.map((l, i) => ({ ...l, productName: lines[i].productName, sizeLabel: lines[i].sizeLabel }));
    return { quote: t, benefits };
  }

  async function quote(actor, clubId, items) {
    return (await computeQuote(actor, clubId, items, { checkStock: true })).quote;
  }

  /** POST /clubs/:clubId/orders (AUTH, [IDEM]) — LLD §5.9 transaction. */
  async function place(actor, clubId, { items, expectedTotalPaise }) {
    const { quote: q, benefits } = await computeQuote(actor, clubId, items, { checkStock: false });
    if (q.totalPaise <= 0) throw appError('PRODUCT_NOT_ORDERABLE', { reason: 'ZERO_TOTAL' }); // OQ-19
    if (q.totalPaise !== expectedTotalPaise) throw appError('PRICE_CHANGED', { quote: q });

    return withTransaction(async (trx) => {
      const now = clock.now();
      // Ascending variant id order prevents deadlocks between multi-line orders (LLD §3.2).
      const sorted = [...q.lines].sort((a, b) => (a.variantId < b.variantId ? -1 : 1));
      for (const line of sorted) {
        const reserved = await stockRepo.reserve(trx, line.variantId, clubId, line.quantity);
        if (!reserved) {
          const v = await catalogue.findVariant(trx, line.variantId);
          throw appError('OUT_OF_STOCK', { variantId: line.variantId, available: available(v) });
        }
      }
      const order = await repository.insertOrder(trx, {
        club_id: clubId,
        user_id: actor.userId,
        status: 'PENDING_PAYMENT',
        buyer_type: benefits ? 'MEMBER' : 'NON_MEMBER',
        subtotal_paise: q.subtotalPaise,
        discount_paise: q.discountPaise,
        total_paise: q.totalPaise,
        pricing_mode: config.pricingCombinationMode,
        membership_term_id: benefits?.termId ?? null,
        hold_expires_at: new Date(now.getTime() + config.reservationHoldMinutes * 60_000), // OQ-09
        created_at: now,
      });
      for (const line of sorted) {
        await stockRepo.insertMovement(trx, { variant_id: line.variantId, club_id: clubId, type: 'RESERVE', quantity: line.quantity, order_id: order.id, actor_user_id: actor.userId });
        await stock.evaluate(trx, line.variantId);
      }
      const orderItems = await repository.insertItems(
        trx,
        sorted.map((l) => ({
          order_id: order.id,
          club_id: clubId,
          product_id: l.productId,
          variant_id: l.variantId,
          quantity: l.quantity,
          unit_list_price_paise: l.unitListPricePaise,
          unit_discount_paise: l.unitDiscountPaise,
          unit_final_price_paise: l.unitFinalPricePaise,
          line_total_paise: l.lineTotalPaise,
          price_rule: l.priceRule,
        })),
      );
      const payment = await payments.create(trx, { clubId, userId: actor.userId, purpose: 'MERCH_ORDER', orderId: order.id, amountPaise: order.total_paise });
      return { order, items: orderItems, payment };
    });
  }

  async function loadOwn(actor, orderId) {
    const order = await repository.findOrder(db, orderId);
    if (!order || order.user_id !== actor.userId) throw appError('NOT_FOUND');
    return order;
  }

  /** POST /orders/:id/cancel (OWNER, PENDING_PAYMENT): settle FAILED(USER_CANCELLED) → release. */
  async function cancel(actor, orderId) {
    const order = await loadOwn(actor, orderId);
    if (order.status !== 'PENDING_PAYMENT') throw appError('CONFLICT_STATE', { currentStatus: order.status });
    await withTransaction(async (trx) => {
      const payment = await payments.findOpenByOrder(orderId, trx);
      if (!payment) throw appError('CONFLICT_STATE', { currentStatus: order.status });
      await payments.settle(payment.id, 'FAILED', trx, { reason: 'USER_CANCELLED' });
    });
    const after = await repository.findOrder(db, orderId);
    if (after.status !== 'CANCELLED') throw appError('CONFLICT_STATE', { currentStatus: after.status });
    return after;
  }

  async function describe(orders, { withPayments = false } = {}) {
    const ids = orders.map((o) => o.id);
    const [items, latest, buyers] = await Promise.all([
      repository.itemsOf(db, ids),
      payments.latestByOrders(ids),
      auth.getUsersByIds([...new Set(orders.map((o) => o.user_id))]),
    ]);
    const history = withPayments && ids.length === 1 ? await payments.listByOrder(ids[0]) : null;
    return {
      items: (id) => items.filter((i) => i.order_id === id),
      payment: (id) => latest.find((p) => p.order_id === id) ?? null,
      buyer: (id) => buyers.find((u) => u.id === id) ?? null,
      history,
    };
  }

  const page = (q) => ({ limit: q.pageSize, offset: toOffset(q) });
  const listMine = (actor, q) => repository.listOrders(db, { user_id: actor.userId }, q, page(q));
  const listForClub = (clubId, q) => repository.listOrders(db, { club_id: clubId }, q, page(q));
  const getMine = (actor, orderId) => loadOwn(actor, orderId);

  /** POST /clubs/:clubId/pickups (CH, [IDEM]) — CONFIRMED → PICKED_UP once. */
  async function pickup(actor, clubId, code, { requestId } = {}) {
    const pickupCode = code.trim().toUpperCase();
    const order = await repository.findByPickupCode(db, clubId, pickupCode);
    if (!order) throw appError('PICKUP_CODE_NOT_FOUND');
    const problem = pickupProblem(order);
    if (problem) throw appError(problem, { orderId: order.id, pickedUpAt: order.picked_up_at });
    return withTransaction(async (trx) => {
      const updated = await repository.transition(trx, order.id, 'CONFIRMED', { status: 'PICKED_UP', picked_up_at: clock.now(), picked_up_by: actor.userId });
      if (!updated) {
        const current = await repository.findOrder(trx, order.id);
        throw appError(pickupProblem(current) ?? 'CONFLICT_STATE', { orderId: order.id, pickedUpAt: current.picked_up_at });
      }
      await auditRecord(trx, { actorUserId: actor.userId, clubId, action: 'ORDER_PICKED_UP', entityType: 'order', entityId: order.id, metadata: {}, requestId });
      return updated;
    });
  }

  return Object.freeze({ quote, place, cancel, listMine, listForClub, getMine, describe, pickup });
}
