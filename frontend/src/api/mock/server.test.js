import { handle, resetDemo } from './server';

jest.setTimeout(30000);

const call = (method, path, opts = {}) => handle({ method, path, ...opts, headers: opts.headers || {} });
const login = (email) => call('POST', '/auth/login', { body: { email, password: 'demo1234' } });

async function clubId() {
  const res = await call('GET', '/clubs');
  return res.body.data.find((c) => c.slug === 'skyline').id;
}

beforeEach(() => {
  window.localStorage.clear();
  resetDemo();
});

test('seed ledger reconciles with payments and expenses', async () => {
  await login('ravi@skyline.ac.in');
  const id = await clubId();
  const rec = await call('GET', `/clubs/${id}/finance/reconciliation`);
  expect(rec.status).toBe(200);
  expect(rec.body.data.checks.filter((c) => !c.ok)).toEqual([]);
  const summary = await call('GET', `/clubs/${id}/finance/summary`);
  const s = summary.body.data;
  expect(s.projectedBalancePaise).toBe(s.availableBalancePaise - s.approvedUnpaidTotalPaise);
});

test('booking → simulated payment issues a ticket and check-in is one-time', async () => {
  await login('priya.nair@gmail.com');
  const events = await call('GET', '/events');
  const fest = events.body.data.find((e) => e.title.startsWith('Skyline Tech Fest'));
  const quote = (await call('GET', `/events/${fest.id}/price-quote`)).body.data;
  expect(quote.buyerType).toBe('NON_MEMBER');
  const booked = await call('POST', `/events/${fest.id}/bookings`, { body: { expectedFinalPricePaise: quote.finalPricePaise }, headers: { 'Idempotency-Key': 'k1' } });
  expect(booked.status).toBe(201);
  const paid = await call('POST', `/payments/${booked.body.data.payment.id}/simulate`, { body: { outcome: 'SUCCEEDED' } });
  expect(paid.body.data.status).toBe('SUCCEEDED');
  const ticket = (await call('GET', `/me/tickets/${paid.body.data.target.ticketId}`)).body.data;

  await login('meera@skyline.ac.in');
  const first = await call('POST', `/events/${fest.id}/check-ins`, { body: { qrPayload: ticket.qrPayload } });
  expect(first.body.data.result).toBe('CHECKED_IN');
  const second = await call('POST', `/events/${fest.id}/check-ins`, { body: { qrPayload: ticket.qrPayload } });
  expect(second.status).toBe(409);
  expect(second.body.error.code).toBe('TICKET_ALREADY_USED');
});

test('price change is detected and idempotent replay returns the same response', async () => {
  await login('priya.nair@gmail.com');
  const fest = (await call('GET', '/events')).body.data.find((e) => e.title.startsWith('Skyline Tech Fest'));
  const changed = await call('POST', `/events/${fest.id}/bookings`, { body: { expectedFinalPricePaise: 1 } });
  expect(changed.body.error.code).toBe('PRICE_CHANGED');
  const quote = changed.body.error.details.quote;
  const a = await call('POST', `/events/${fest.id}/bookings`, { body: { expectedFinalPricePaise: quote.finalPricePaise }, headers: { 'Idempotency-Key': 'same' } });
  const b = await call('POST', `/events/${fest.id}/bookings`, { body: { expectedFinalPricePaise: quote.finalPricePaise }, headers: { 'Idempotency-Key': 'same' } });
  expect(b.body.data.booking.id).toBe(a.body.data.booking.id);
});

test('authorization: volunteer cannot read ledger, non-member sees 404 for other club scope', async () => {
  await login('meera@skyline.ac.in');
  const id = await clubId();
  expect((await call('GET', `/clubs/${id}/transactions`)).status).toBe(403);
  expect((await call('GET', `/clubs/${id}/finance/summary`)).status).toBe(200);
  await login('priya.nair@gmail.com');
  expect((await call('GET', `/clubs/${id}/transactions`)).status).toBe(404);
});

test('treasurer cannot approve own claim; club head can', async () => {
  await login('ravi@skyline.ac.in');
  const id = await clubId();
  const list = (await call('GET', `/clubs/${id}/expenses`, { query: { status: 'SUBMITTED' } })).body.data;
  const own = list.find((e) => e.submittedByName === 'Ravi Kumar');
  expect(own.viewerCanDecide).toBe(false);
  expect((await call('POST', `/expenses/${own.id}/approve`, { body: {} })).body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
  await login('asha@skyline.ac.in');
  expect((await call('POST', `/expenses/${own.id}/approve`, { body: {} })).body.data.status).toBe('APPROVED');
});

test('merch order reserves stock then decrements on payment success', async () => {
  await login('karthik@skyline.ac.in');
  const id = await clubId();
  const products = (await call('GET', `/clubs/${id}/products`)).body.data;
  const cap = products.find((p) => p.name === 'Embroidered Cap');
  const v = cap.variants[0];
  const quote = (await call('GET', `/clubs/${id}/orders/quote`, { query: { items: `${v.id}:2` } })).body.data;
  const placed = await call('POST', `/clubs/${id}/orders`, { body: { items: [{ variantId: v.id, quantity: 2 }], expectedTotalPaise: quote.totalPaise } });
  expect(placed.status).toBe(201);
  const after = (await call('GET', `/clubs/${id}/products`)).body.data.find((p) => p.id === cap.id).variants[0];
  expect(after.available).toBe(v.available - 2);
  await call('POST', `/payments/${placed.body.data.payment.id}/simulate`, { body: { outcome: 'SUCCEEDED' } });
  const order = (await call('GET', `/me/orders/${placed.body.data.order.id}`)).body.data;
  expect(order.status).toBe('CONFIRMED');
  expect(order.pickupCode).toHaveLength(8);
});
