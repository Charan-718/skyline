import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './layout/AppShell';
import { RequireAuth, RequireClubRole } from './auth/guards';
import { LoadingState } from './components/feedback';
import { IS_DEMO } from './api/config';
import Splash, { useSplash } from './components/Splash';

const page = (loader) => lazy(loader);

const Login = page(() => import('./pages/auth/Login'));
const Register = page(() => import('./pages/auth/Register'));
const Home = page(() => import('./pages/public/Home'));
const Events = page(() => import('./pages/public/Events'));
const EventDetail = page(() => import('./pages/public/EventDetail'));
const Clubs = page(() => import('./pages/public/Clubs'));
const ClubPage = page(() => import('./pages/public/ClubPage'));
const Announcements = page(() => import('./pages/public/Announcements'));
const Shop = page(() => import('./pages/public/Shop'));
const Checkout = page(() => import('./pages/checkout/Checkout'));
const Profile = page(() => import('./pages/me/Profile'));
const MyMemberships = page(() => import('./pages/me/Memberships'));
const MembershipDetail = page(() => import('./pages/me/MembershipDetail'));
const MembershipCard = page(() => import('./pages/me/MembershipCard'));
const MyTickets = page(() => import('./pages/me/Tickets'));
const TicketDetail = page(() => import('./pages/me/TicketDetail'));
const MyOrders = page(() => import('./pages/me/Orders'));
const OrderDetail = page(() => import('./pages/me/OrderDetail'));
const MyPayments = page(() => import('./pages/me/Payments'));
const MyTasks = page(() => import('./pages/me/Tasks'));
const MyExpenses = page(() => import('./pages/me/Expenses'));
const Duties = page(() => import('./pages/me/Duties'));
const Dashboard = page(() => import('./pages/manage/Dashboard'));
const Members = page(() => import('./pages/manage/Members'));
const Plans = page(() => import('./pages/manage/Plans'));
const ManageEvents = page(() => import('./pages/manage/Events'));
const EventEditor = page(() => import('./pages/manage/EventEditor'));
const EventManage = page(() => import('./pages/manage/EventManage'));
const ManageAnnouncements = page(() => import('./pages/manage/Announcements'));
const Merchandise = page(() => import('./pages/manage/Merchandise'));
const ManageOrders = page(() => import('./pages/manage/Orders'));
const Fundraisers = page(() => import('./pages/manage/Fundraisers'));
const FundraiserDetail = page(() => import('./pages/manage/FundraiserDetail'));
const Finance = page(() => import('./pages/manage/Finance'));
const Reports = page(() => import('./pages/manage/Reports'));
const Roles = page(() => import('./pages/manage/Roles'));
const Scan = page(() => import('./pages/scan/Scan'));
const DevTools = page(() => import('./pages/dev/DevTools'));
const Terms = page(() => import('./pages/legal/Terms'));
const Privacy = page(() => import('./pages/legal/Privacy'));
const NotFound = page(() => import('./pages/NotFound'));

const CH = ['CLUB_HEAD'];
const CH_TR = ['CLUB_HEAD', 'TREASURER'];
const auth = (el) => <RequireAuth>{el}</RequireAuth>;
const club = (roles, el) => (
  <RequireAuth>
    <RequireClubRole roles={roles}>{el}</RequireClubRole>
  </RequireAuth>
);

export default function App() {
  const splash = useSplash();
  if (splash) return <Splash />;

  return (
    <Suspense fallback={<LoadingState rows={6} />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:eventId" element={<EventDetail />} />
          <Route path="clubs" element={<Clubs />} />
          <Route path="clubs/:clubId" element={<ClubPage />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="shop/:clubId" element={<Shop />} />
          <Route path="checkout/:paymentId" element={auth(<Checkout />)} />

          <Route path="me/profile" element={auth(<Profile />)} />
          <Route path="me/memberships" element={auth(<MyMemberships />)} />
          <Route path="me/memberships/:membershipId" element={auth(<MembershipDetail />)} />
          <Route path="me/memberships/:membershipId/card" element={auth(<MembershipCard />)} />
          <Route path="me/tickets" element={auth(<MyTickets />)} />
          <Route path="me/tickets/:ticketId" element={auth(<TicketDetail />)} />
          <Route path="me/orders" element={auth(<MyOrders />)} />
          <Route path="me/orders/:orderId" element={auth(<OrderDetail />)} />
          <Route path="me/payments" element={auth(<MyPayments />)} />
          <Route path="me/tasks" element={auth(<MyTasks />)} />
          <Route path="me/expenses" element={auth(<MyExpenses />)} />
          <Route path="me/duties" element={auth(<Duties />)} />

          <Route path="manage/events/:eventId" element={auth(<EventManage />)} />
          <Route path="manage/fundraisers/:fundraiserId" element={auth(<FundraiserDetail />)} />
          <Route path="manage/:clubId" element={club('TEAM', <Dashboard />)} />
          <Route path="manage/:clubId/members" element={club(CH_TR, <Members />)} />
          <Route path="manage/:clubId/plans" element={club(CH, <Plans />)} />
          <Route path="manage/:clubId/events" element={club(CH_TR, <ManageEvents />)} />
          <Route path="manage/:clubId/events/new" element={club(CH, <EventEditor />)} />
          <Route path="manage/:clubId/announcements" element={club(CH, <ManageAnnouncements />)} />
          <Route path="manage/:clubId/merchandise" element={club(CH_TR, <Merchandise />)} />
          <Route path="manage/:clubId/orders" element={club(CH_TR, <ManageOrders />)} />
          <Route path="manage/:clubId/fundraisers" element={club('TEAM', <Fundraisers />)} />
          <Route path="manage/:clubId/finance" element={club('TEAM', <Finance />)} />
          <Route path="manage/:clubId/reports" element={club(CH_TR, <Reports />)} />
          <Route path="manage/:clubId/roles" element={club(CH, <Roles />)} />
          <Route path="scan/:eventId" element={auth(<Scan />)} />
          {IS_DEMO && <Route path="dev" element={auth(<DevTools />)} />}
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
