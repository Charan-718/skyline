import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ThemeProvider } from './components/Theme';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './auth/AuthProvider';
import { handle, resetDemo } from './api/mock/server';

jest.setTimeout(60000);

const call = (method, path, body) => handle({ method, path, body, headers: {} });
let ids = {};

beforeAll(async () => {
  window.localStorage.clear();
  // Sign-ins below go straight to the mock server, so mark the browser as having a session.
  window.localStorage.setItem('campusflow.session', '1');
  resetDemo();
  await call('POST', '/auth/login', { email: 'asha@skyline.ac.in', password: 'demo1234' });
  const clubs = (await call('GET', '/clubs')).body.data;
  const sky = clubs.find((c) => c.slug === 'skyline');
  const events = (await call('GET', `/clubs/${sky.id}/events`)).body.data;
  const fest = events.find((e) => e.title.startsWith('Skyline Tech Fest'));
  const funds = (await call('GET', `/clubs/${sky.id}/fundraisers`)).body.data;
  const mems = (await call('GET', '/me/memberships')).body.data;
  const tickets = (await call('GET', '/me/tickets')).body.data.filter((t) => !t.pending);
  const orders = (await call('GET', '/me/orders')).body.data;
  ids = { club: sky.id, event: fest.id, fund: funds[0].id, mem: mems[0].id, ticket: tickets[0].id, order: orders[0].id };
});

function renderAt(path) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const routes = () => [
  ['/home', /clubs, events & money/i],
  ['/events', /^events$/i],
  [`/events/${ids.event}`, /skyline tech fest 2026/i],
  ['/clubs', /^clubs$/i],
  ['/clubs/skyline', /skyline student association/i],
  ['/announcements', /^announcements$/i],
  [`/shop/${ids.club}`, /shop$/i],
  ['/me/profile', /profile & verification/i],
  ['/me/memberships', /my memberships/i],
  [`/me/memberships/${ids.mem}`, /.+/],
  [`/me/memberships/${ids.mem}/card`, /digital membership id/i],
  ['/me/tickets', /my tickets/i],
  [`/me/tickets/${ids.ticket}`, /.+/],
  ['/me/orders', /my orders/i],
  [`/me/orders/${ids.order}`, /^order /i],
  ['/me/payments', /payment history/i],
  ['/me/tasks', /my tasks/i],
  ['/me/expenses', /reimbursements/i],
  ['/me/duties', /event duties/i],
  [`/manage/${ids.club}`, /dashboard/i],
  [`/manage/${ids.club}/members`, /^members$/i],
  [`/manage/${ids.club}/plans`, /membership plans/i],
  [`/manage/${ids.club}/events`, /^events$/i],
  [`/manage/${ids.club}/events/new`, /create event/i],
  [`/manage/events/${ids.event}`, /skyline tech fest 2026/i],
  [`/manage/events/${ids.event}?tab=bookings`, /skyline tech fest 2026/i],
  [`/manage/events/${ids.event}?tab=team`, /skyline tech fest 2026/i],
  [`/manage/${ids.club}/announcements`, /^announcements$/i],
  [`/manage/${ids.club}/merchandise`, /merchandise/i],
  [`/manage/${ids.club}/merchandise?tab=inventory`, /merchandise/i],
  [`/manage/${ids.club}/orders`, /orders & pickup/i],
  [`/manage/${ids.club}/fundraisers`, /^fundraisers$/i],
  [`/manage/fundraisers/${ids.fund}`, /.+/],
  [`/manage/${ids.club}/finance`, /^finance$/i],
  [`/manage/${ids.club}/finance?tab=expenses`, /^finance$/i],
  [`/manage/${ids.club}/finance?tab=budgets`, /^finance$/i],
  [`/manage/${ids.club}/finance?tab=reconciliation`, /^finance$/i],
  [`/manage/${ids.club}/reports`, /^reports$/i],
  [`/manage/${ids.club}/roles`, /team & roles/i],
  [`/scan/${ids.event}`, /door check-in/i],
  ['/dev', /dev tools/i],
  ['/terms', /terms of use/i],
  ['/privacy', /privacy policy/i],
  ['/nope', /page not found/i],
];

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

test('every route renders without errors for a club head', async () => {
  for (const [path, heading] of routes()) {
    const view = renderAt(path);
    let title = null;
    try {
      title = await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 });
    } catch {
      title = null;
    }
    await settle();
    const error = screen.queryByText(/could not load this|something went wrong/i);
    // include the path so a failure names the broken route
    expect({ path, title: !!title, error: error?.textContent ?? null }).toEqual({ path, title: true, error: null });
    view.unmount();
  }
});

test('volunteer sees finance summary but not ledger tabs; non-member sees access message', async () => {
  await call('POST', '/auth/login', { email: 'meera@skyline.ac.in', password: 'demo1234' });
  let view = renderAt(`/manage/${ids.club}/finance`);
  await screen.findByRole('heading', { level: 1, name: /^finance$/i });
  expect(await screen.findByText(/line-by-line transactions/i)).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /transactions/i })).toBeNull();
  view.unmount();

  await call('POST', '/auth/login', { email: 'priya.nair@gmail.com', password: 'demo1234' });
  view = renderAt(`/manage/${ids.club}/finance`);
  expect(await screen.findByText(/you don't have access to this page/i)).toBeInTheDocument();
  view.unmount();
});
