# Backend Workstream — Group 2 (Platform & Commerce)

| Field | Value |
|---|---|
| Document | `docs/BACKEND_GROUP_2_PLATFORM_COMMERCE.md` |
| Pair doc | `docs/BACKEND_GROUP_1_ENGAGEMENT.md` |
| Sources of truth | `HLD.md`, `LLD.md`, `IMPLEMENTATION_PLAN.md`, `REQUIREMENT_TRACEABILITY.md` |
| HLD modules | M6 Notifications, M7 Merchandise, M8 Fundraisers, M9 Finance, M10 Reporting; `shared`, `jobs` |

**Theme:** Platform core (config, middleware, migrations baseline), simulated payments and ledger, notification outbox and dispatch, merchandise and inventory, fundraisers, expenses/budgets/receipts, read-model reporting. You **own money movement**; Group 1 **owns** membership/event/ticket side effects via payment handlers.

---

## 1. Scope summary

| Area | In scope | Out of scope (Group 1) |
|---|---|---|
| `shared/*`, middleware, audit, idempotency | ✔ **lead** | Auth/clubs business rules |
| Knex migrations 001, 004 (+ baseline order) | ✔ | 002, 003, 006, 007 |
| Simulated payments, handler registry, `ledger.post` | ✔ | Handler business logic inside G1 modules |
| Notifications outbox, adapters, dispatch job | ✔ | Announcement content, publish workflow |
| Merchandise catalogue, stock, orders, pickup | ✔ | Event ticketing |
| Fundraisers and tasks | ✔ | — |
| Expenses, reimbursements, budgets, files, income entries | ✔ | — |
| Reporting read model | ✔ | Event CRUD, check-in |
| Jobs infrastructure | `runJob`, scheduler wiring, `notification-dispatch`, stock/order half of `reservation-expiry` | Membership expiry, reminders, AutoPay definitions |
| Docker/backend entrypoint, CI lint boundaries | ✔ **lead** with pair on T-11 | — |

**Estimated backend effort (from plan):** ~115–125 focused hours after joint foundation.

---

## 2. Backend modules and folders

```
backend/src/
├── config/               # zod env validation
├── shared/               # errors, money, clock, tokens, qr, logger, audit, middleware
├── db/migrations/        # 001, 004, 005, 008, 009, 010, 011, 012 (you own these files)
├── modules/
│   ├── notifications/    # enqueue API, templates, Email/WhatsApp adapters, dispatch
│   ├── merchandise/      # catalogue, stock, orders, pickup, order payment handler
│   ├── fundraisers/        # projects, tasks, progress domain
│   ├── finance/
│   │   ├── payments/       # create, settle, simulator, handlerRegistry
│   │   ├── ledger/
│   │   ├── expenses/, budgets/, income/, files/
│   └── reporting/          # read-only SQL aggregations
├── jobs/
│   ├── scheduler.js
│   ├── runJob.js           # advisory lock + job_runs
│   └── definitions/
│       ├── notificationDispatch.js
│       └── reservationExpiry.js   # order/stock holds (pair with G1 on bookings)
└── modules/dev/            # dev job runner, outbox viewer (when DEV_TOOLS_ENABLED)
```

Payment purpose handler you implement:

- `MERCH_ORDER` → `merchandise/handlers/orderPaymentHandler.js`

Handlers for membership and tickets live in Group 1; you register all four in `container.js`.

---

## 3. Task checklist (IMPLEMENTATION_PLAN IDs)

| Phase | Task ID | Description | Deliver to Group 1 |
|---|---|---|---|
| **Pair** | T-10, T-11 | Monorepo, Docker, backend Dockerfile/entrypoint | Runnable `/health` |
| **Lead** | T-12 | Backend core: config, logger, middleware shell, `withTransaction`, money, clock | Before T-20 |
| **Lead** | T-13 | Migrations 001 & 004 (`audit_logs`, `idempotency_keys`, `job_runs`) | Before auth |
| **Pair** | T-15 | Test harness (supertest, test DB) | — |
| **Lead** | T-24 | Idempotency middleware + audit helper | Before T-32 |
| 3 | **T-32** | **Payments + ledger `post()`** — **priority** | Unblocks G1 T-33, T-43 |
| 5 | **T-50** | Notification outbox + dev adapters | Unblocks G1 T-52, T-55 |
| 5 | **T-51** | Job runner + scheduler + dev run endpoint | Unblocks all jobs |
| 5 | T-54 | Reservation expiry (orders + shared job file with G1) | After T-62 / G1 T-43 |
| 6 | T-60 | Merchandise catalogue | Uses G1 T-40 PricingPolicy |
| 6 | T-61 | Stock movements, low-stock → enqueue email | T-50 |
| 6 | T-62 | Orders + payment handler | T-32, T-40 |
| 6 | T-63 | Pickup codes | T-62 |
| 7 | T-70 | Fundraisers + tasks | T-23 authZ from G1 |
| 7 | T-71 | Overview / on-track (money figures tie to ledger) | T-81 optional for income display |
| 8 | T-80 | File storage + receipt upload | — |
| 8 | T-81 | Expenses lifecycle + ledger OUT | — |
| 8 | T-82 | Fundraiser income, budgets | T-81 |
| 8 | T-83 | Finance summary, transactions, reconciliation | T-81, T-82 |
| 8 | T-85 | Merchandise + membership **report SQL** | G1 data models |
| 9 | T-90 | Concurrency: inventory, settlement, AutoPay (with G1) | — |
| 9 | T-92 | Security: uploads, headers (partial) | — |
| 9 | T-93 | Docker reproducibility (lead with G1 on README) | — |

**Ship order inside your track:** T-12 → T-13 → T-24 → **T-32** → T-50 + T-51 (can parallel after T-13) → merchandise chain → finance → reporting.

---

## 4. Database migrations (owner)

| Migration | Tables (principal) | Notes |
|---|---|---|
| 001 | Core extensions, shared prep | First in chain |
| 004 | `audit_logs`, `idempotency_keys`, `job_runs`, triggers | With 001 |
| 005 | `uploaded_files` | Before expenses |
| 008 | `product_categories`, `products`, `product_variants`, `stock_movements`, `low_stock_alerts`, `orders`, `order_items` | Composite club FKs |
| 009 | `payments` | FKs to bookings/orders/terms as G1 migrations land |
| 010 | `fundraisers`, `fundraiser_tasks` | |
| 011 | `financial_transactions`, `expenses`, `budgets` | Ledger immutability triggers |
| 012 | `notification_deliveries`, **`announcements`** | Coordinate announcement columns with G1 |

Never rewrite merged migrations. Add `013_*` for follow-up FKs if G1 tables merge after your payment migration.

---

## 5. Public service API you must expose (`index.js`)

Freeze at **CP-1**; these are the platform contracts for the whole backend.

| Module | Functions (examples) | Called by |
|---|---|---|
| `finance/payments` | `create`, `settle`, `getById`, simulate flow | G1 handlers, merchandise, AutoPay job |
| `finance/ledger` | `post(trx, { clubId, amount, sourceType, sourceId, ... })` | Payment settle, expenses PAID, income entries |
| `notifications` | `enqueue(trx, deliveries[])`, `dispatchPending()` | G1 announcements, booking confirm, reminders, low-stock |
| `merchandise` | `quoteOrder`, stock APIs | FE shop |
| `fundraisers` | `getFundraiserOverview` | FE, reporting |
| `finance/expenses` | submit, approve, reject, markPaid | Volunteers, treasurers |
| `reporting` | `eventReport`, `financeSummary`, `membershipReport`, `merchandiseReport` | FE reports (event report coordinates G1 metrics) |

You **consume** Group 1 APIs (never their repositories):

- `memberships.getEffectiveMembership`, `getActiveBenefits` — merch member discount
- `clubs.hasClubRole` — via authZ middleware G1 co-owns

---

## 6. API surface (LLD §4 — your routes)

| Prefix / resource | Owner module |
|---|---|
| `/payments/:paymentId`, `/payments/:paymentId/simulate`, `/me/payments` | finance/payments |
| `/clubs/:clubId/products`, categories, inventory, orders, pickups, low-stock-alerts | merchandise |
| `/products/:id`, `/variants/:id/stock-adjustments`, `/orders/:id/cancel`, `/me/orders` | merchandise |
| `/clubs/:clubId/fundraisers`, `/fundraisers/:id/tasks`, `/tasks/:id`, `/me/tasks` | fundraisers |
| `/clubs/:clubId/budgets`, expenses, income-entries, transactions, `finance/summary` | finance |
| `/expenses/:id/approve`, reject, mark-paid, receipt | finance |
| `/clubs/:clubId/reports/{memberships,merchandise,finance}` | reporting |
| `/health`, `/dev/*` | app / dev |

Announcement REST routes are Group 1; delivery rows are your table.

---

## 7. Payments and ledger (ADR-010, ADR-015)

**You own:**

- Payment state machine and conditional `settle()`
- `handlerRegistry` — domains register; **no** imports from memberships/events/merchandise inside `payments/service.js`
- `is_simulated` always true
- Idempotency: at most one `SUCCEEDED` payment per booking/order/term (partial unique indexes)
- Ledger: append-only `financial_transactions`; one row per `(source_type, source_id)`; immutability trigger

**Settlement flow (same transaction):**

1. Conditional update payment → `SUCCEEDED` / `FAILED`
2. Invoke registered purpose handler
3. Handler calls domain logic + `ledger.post` for income when money received
4. Enqueue notifications
5. Audit

Group 1 handlers must not call `ledger.post` outside this pattern.

---

## 8. Notifications (ADR-014)

| Piece | Owner |
|---|---|
| Insert `notification_deliveries` in business txn | Caller (often G1) via `enqueue` |
| Templates, payload rendering | You |
| `DevEmailAdapter` / `DevWhatsAppAdapter`, `NOT_CONFIGURED` | You |
| `notification-dispatch` job (retries, SKIP LOCKED) | You |

Group 1 must not call external providers directly.

---

## 9. Jobs you own or co-own

| Job | Owner | Schedule (IST) |
|---|---|---|
| `notification-dispatch` | G2 | every minute |
| `reservation-expiry` | **Shared** — G2: orders/stock; G1: bookings/terms | every minute |
| Job runner (`runJob`, advisory lock, `job_runs`) | G2 | — |

Group 1 owns job **definitions** for membership-expiry, renewal-reminders, autopay-renewals; you wire them in `scheduler.js` once G1 files exist.

---

## 10. Authorization responsibilities

Implement authZ for:

- Treasurer/club head finance operations (separation of duties OD-06)
- Merchandise management and pickup verification
- Fundraiser CRUD vs volunteer task updates
- Receipt download authorization
- Report endpoints (read-only, club-scoped)

Extend **TC-AZ-01** for every endpoint above.

---

## 11. Transaction boundaries you own

| Operation | Atomic unit |
|---|---|
| Settle payment success | payment update → handler → ledger income → enqueue → audit |
| Settle failure / hold expiry | release stock/seats (via handler callbacks + reservation job) |
| Order placement | reserve stock → order → payment INITIATED |
| Mark expense PAID | expense update → ledger expense row |
| Stock adjustment | variant counters + `stock_movements`; low-stock evaluate → enqueue |
| Dispatch notification | claim row → adapter → status update (separate txn from business) |

Concurrency: TC-MER-02 (orders), TC-PAY-01 (settlement), TC-FIN-04 (ledger idempotency).

---

## 12. Tests you own

| Test IDs | Topic |
|---|---|
| TC-PAY-01, TC-PAY-02 | Payments, idempotency |
| TC-FIN-01..06 | Expenses, ledger, files, reconciliation |
| TC-ANN-03 | Notification retries / NOT_CONFIGURED |
| TC-REM-03 | Dispatch behaviour |
| TC-MER-01..06 | Stock, orders, pickup |
| TC-FUN-01, TC-FUN-02 | Fundraisers |
| TC-RPT-02 | Merch/membership reports |
| TC-FIN-03, TC-FIN-05 | Finance summary vs ledger |

---

## 13. Git and review rules

- Branch prefix: `g2/T-nn-short-name`
- **Required reviewer from Group 1** for: `shared/`, `container.js`, migrations, LLD §4, pricing mode config affecting OD-01
- **Early communication** when changing `payments.settle` signature or ledger post shape

---

## 14. Checkpoints (your demo script)

| Checkpoint | You demonstrate |
|---|---|
| **CP-1** | T-32 stub: create + settle calls handler registry; T-50 enqueue + dev outbox; migrations 001/004/009 skeleton |
| **CP-2** | G1 membership + ticket settle posts exactly one ledger row each; simulate failure releases hold |
| **CP-3** | Merch order end-to-end; expense approved → paid → ledger; finance summary reconciles |
| **CP-4** | T-90 inventory/settlement; upload security; prod Compose profile |

---

## 15. Definition of done (module extras)

See `IMPLEMENTATION_PLAN.md` §5. Additionally:

| Module | Extra criteria |
|---|---|
| Payments | Handler runs once under concurrent settle; `isSimulated` true in API |
| Ledger | Reconciliation `ok=true` after full suite; UPDATE/DELETE blocked |
| Merchandise | No negative stock; low-stock one alert per threshold crossing |
| Notifications | Business txn never rolls back on adapter failure; 3 retries then FAILED |
| Finance | Pending expenses excluded from cash balance per LLD formulas |

---

## 16. Risks and dependencies

| Risk | Mitigation |
|---|---|
| G1 blocked on you | Target **T-32 + T-50 within first sprint** after T-12/T-13 |
| Financial inconsistency (R-08) | Single `ledger.post`; unique source constraint |
| Provider not configured (R-02) | Dev adapters + delivery status visible |
| PricingPolicy changes (G1 owns) | Consume via `pricing.quoteLineItem`; no duplicate discount logic |

**Slack / standup ask to Group 1:** “Handler ready for MERCH_ORDER?” “Ticket holder API stable for reports?” “Migration 007 merged for payment FKs?”

---

## 17. Joint foundation split (week 1)

| Group 2 leads | Group 1 leads | Together |
|---|---|---|
| T-12, T-13, T-24 | T-20–T-23 | T-10, T-11, T-15 |
| `shared/middleware` skeleton | Auth routes wired | CP-1 API freeze meeting |
| dependency-cruiser rules | Club seed CLI | Review each other’s PRs |

After week 1, **your highest priority deliverable is T-32**, then T-50/T-51 in parallel with merchandise prep (T-60 schema work).
