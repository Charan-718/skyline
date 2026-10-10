# Frontend ↔ Backend live integration

## Quick start

```bash
# Terminal 1 — database + API
docker compose up db backend
# or: cd backend && npm run migrate && npm start

# Terminal 2 — UI (live mode)
cd frontend
cp .env.example .env.development   # if needed
npm install && npm start
```

- Backend: http://localhost:4000/api/v1/health → `{ "data": { "status": "ok", "db": "ok" } }`
- Frontend: http://localhost:3000 (CRA proxies `/api/v1` → `:4000`)

## Environment

| Variable | Dev value | Purpose |
|----------|-----------|---------|
| `REACT_APP_API_MODE` | `live` | Use Express instead of in-browser mock |
| `REACT_APP_API_BASE_URL` | `/api/v1` | Must match backend mount + CRA proxy |

Root `.env`: `DATABASE_URL`, `CORS_ORIGIN=http://localhost:3000`, `SESSION_SECRET`, `COLLEGE_EMAIL_DOMAINS`.

## Auth (session cookies)

- Login/register set `sid` cookie; all API calls use `credentials: 'include'`.
- Mutations require header `X-Requested-With: soms` (handled in `frontend/src/api/client.js`).
- `GET /auth/me` → `{ data: { user, capabilities, accountAudience? } }` (same shape as mock login).

## Implemented on backend (Group 1 + Group 2 mount)

- Auth, clubs, memberships (core), events (list/get/quote/book/check-in/create/publish), payments (`GET`, simulate, `GET /me/payments`), announcements feed (paginated), event report.
- **Group 2 (live):** club finance (expenses, budgets, income, transactions, summary), merchandise, fundraisers, club finance report (`/clubs/:clubId/reports/finance`).

## Pagination contract (mock-aligned)

Paged GET handlers return top-level JSON:

```json
{ "data": [], "page": 1, "pageSize": 20, "total": 0 }
```

Used by: `/events`, `/announcements` (and more to wire).

## Gaps vs `frontend/src/api/endpoints/*` (add routes to backend)

| Area | Status |
|------|--------|
| Events: patch, cancel, complete, organizers, staff, bookings list, `/me/tickets` | Not wired |
| Memberships: plan patch/archive, renewals, autopay, digital-id, club members list | Partial |
| Payments: `/me/payments` | Missing |
| Finance, merchandise, fundraisers, club reports | Mounted via `integration/wireGroup2.js` on Group 1 `container.js` (`routes.group2`) |
| Dev: `/dev/outbox`, `/dev/reset`, etc. | Mock only (except `/dev/college-roster`) |

When adding endpoints, match field names from `frontend/src/api/mock/handlers/*.js`.

## Smoke (Postman)

Import `backend/postman/SOMS-Group1.postman_collection.json` + `SOMS-Local` environment.
