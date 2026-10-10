# Skyline SOMS — Frontend

React SPA for the Student Organization Management System (see `../docs`). Built with Create React App, React Router 6, TanStack Query, Recharts, Phosphor icons, `qrcode.react` and `html5-qrcode`.

Design system: `../design-system/skyline-soms/MASTER.md` (tokens live in `src/styles/tokens.css`).

## Run

```bash
npm install
npm start          # http://localhost:3000
npm run test:ci    # demo-backend rules + every route rendered per role
npm run lint
npm run build
```

## API modes (`.env`)

| `REACT_APP_API_MODE` | Behaviour |
|---|---|
| `mock` (default) | In-browser demo backend (`src/api/mock`) implementing the LLD §4 contract with seeded data. State persists in `localStorage`; reset it from **Dev tools**. Demo password for every account: `demo1234`. |
| `live` | Calls the Express API at `REACT_APP_API_BASE_URL` (`/api/v1`). `npm start` proxies to `http://localhost:4000`. Dev tools are hidden. |

Both modes go through `src/api/client.js` (cookies, `X-Requested-With`, `Idempotency-Key`, error envelope → `ApiError`). Pages call only `src/api/endpoints/*`, so no page changes are needed when the backend arrives.

The demo backend is a stand-in for the server: pricing, eligibility, finance formulas and permissions are computed there, never in components.

## Structure

```
src/
  api/          client, endpoints per module, mock/ (demo backend + seed + tests)
  auth/         AuthProvider (GET /auth/me capabilities), route guards
  components/   design-system components (Button, DataTable, Modal, forms, charts, states…)
  layout/       AppShell — role-aware sidebar, club switcher, theme, skip link
  pages/        public/, me/, manage/, scan/, checkout/, dev/
  styles/       tokens.css, base.css, components.css
  utils/        money (paise), dates, status labels/tones, error messages
```

## Contract notes for the backend team

- `GET /events/:id/staff` returns `{ staff, candidates }` — `candidates` (club volunteers) lets organizers, who cannot read `/clubs/:id/roles`, pick door staff.
- `GET /events/:id` includes viewer flags `viewerCanManage`, `viewerIsClubHead`, `viewerCanScan`, `viewerBooking`.
- `GET /clubs/:id/expenses` rows include `viewerCanDecide` / `viewerCanPay` (separation of duties evaluated server-side).
- `GET /clubs/:id/memberships` accepts `expiringWithin=<days>`.
- `GET /dev/autopay-candidates` and `POST /dev/reset` exist only in the demo backend.
- Check-in also accepts the 10-character ticket code as `qrPayload` (manual entry fallback, HLD risk R-06).
