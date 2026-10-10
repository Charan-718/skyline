import { idemKey } from './testApp.js';

const H = { 'X-Requested-With': 'soms' };

export const placeOrder = (agent, clubId, items, expectedTotalPaise, key = idemKey()) =>
  agent.post(`/api/v1/clubs/${clubId}/orders`).set(H).set('Idempotency-Key', key).send({ items, expectedTotalPaise });

export const pay = (agent, paymentId, outcome = 'SUCCEEDED') =>
  agent.post(`/api/v1/payments/${paymentId}/simulate`).set(H).set('Idempotency-Key', idemKey()).send({ outcome });

export const adjust = (agent, variantId, body, key = idemKey()) =>
  agent.post(`/api/v1/variants/${variantId}/stock-adjustments`).set(H).set('Idempotency-Key', key).send(body);

export const variantRow = (db, id) => db('product_variants').where({ id }).first();

/** Place and pay an order of `quantity` units of one variant priced `unitPaise`. */
export async function buy(agent, clubId, variantId, quantity, unitPaise) {
  const placed = await placeOrder(agent, clubId, [{ variantId, quantity }], unitPaise * quantity);
  if (placed.status !== 201) throw new Error(`order failed: ${placed.status} ${JSON.stringify(placed.body)}`);
  const paid = await pay(agent, placed.body.data.payment.id);
  if (paid.status !== 200) throw new Error(`payment failed: ${paid.status}`);
  return { order: placed.body.data.order, payment: paid.body.data };
}
