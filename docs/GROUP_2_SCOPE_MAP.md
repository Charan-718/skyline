# Group 2 Scope Map — Platform & Commerce

| Field | Value |
|---|---|
| Document | `docs/GROUP_2_SCOPE_MAP.md` |
| Status | **APPROVED** 2026-10-10 (Step 1). Updated for the Step 2 decisions; see the decision log in `GROUP_2_OPEN_QUESTIONS.md`. |
| Scope source | `BACKEND_GROUP_2_PLATFORM_COMMERCE.md` (G2 doc). Contracts from `LLD.md`; tasks from `IMPLEMENTATION_PLAN.md` §1; requirement IDs from `REQUIREMENT_TRACEABILITY.md`. |
| Open questions | `docs/GROUP_2_OPEN_QUESTIONS.md` (referenced as `OQ-nn` below) |
| Repo state at writing | `docs/` only. No backend, frontend or Group 1 code exists. Step 2 (T-10…T-15, T-24, T-32) adds `backend/`. |

Legend: **G2** = this workstream; **G1** = Engagement workstream; **Partial** = G2 delivers the part named, G1 delivers the rest. Frontend routes are from LLD §6.1 for reference only: **Group 2 is backend only (OQ-02 APPROVED)**; the FE route column is not a Group 2 deliverable.

---

## 1. Requirement map

### 1.1 Platform foundation (joint/lead tasks)

| Req | LLD | Tables | Endpoints | Backend module | FE route | Task | Tests |
|---|---|---|---|---|---|---|---|
| PR-TECH-01 (stack) | §1.1 | — | — | repo scaffold | Vite scaffold | T-10 (pair) | lint/build |
| PR-TECH-02 (Compose, env, health) | §1.3, §4.11 | — | `GET /health` | `app.js`, `server.js`, Dockerfile, entrypoint | — | T-11 (pair), T-93 | T-93 checklist |
| PR-TECH-03 / NFR-13 (modular monolith, layering) | §1.2 | — | — | `.dependency-cruiser.cjs` | — | T-10 | dependency-cruiser in CI |
| PR-TECH-04 / NFR-02 / NFR-12 (security, redaction, envelope) | §9 | `audit_logs` | all | `shared/{errors,logger,audit}`, `shared/middleware/*` | — | T-12, T-92 (partial) | unit: error envelope, redaction; T-92 checklist |
| PR-TECH-05 / NFR-14 (test harness, injectable clock/adapters) | §10 | `soms_test` DB | — | `tests/helpers/*` | Playwright config | T-15 (pair) | sample tests |
| PR-FIN-12 (migration framework, shared tables) | §3.1 shared, §3.5 | `audit_logs`, `idempotency_keys`, `job_runs`; functions `set_updated_at`, `forbid_update_delete` | — | `db/migrations/001`, `004` | — | T-13 | migrate up/down; TC-FIN-04 (trigger) |
| PR-FIN-13 / NFR-06 (idempotency, duplicate prevention) | §3.1 `idempotency_keys`, §4.0 | `idempotency_keys`, `audit_logs` | every [IDEM] route | `shared/middleware/idempotency.js`, `shared/audit.js` | — (not G2, OQ-02) | T-24 | TC-PAY-02 |
| NFR-09 (restart-safe jobs) | §7 | `job_runs` | `POST /dev/jobs/:jobName/run` | `jobs/runJob.js`, `jobs/scheduler.js`, `modules/dev` | `/dev` (job runner) | T-51 | duplicate-run test |

### 1.2 Payments, ledger, notifications

| Req | LLD | Tables | Endpoints | Backend module | FE route | Task | Tests |
|---|---|---|---|---|---|---|---|
| PR-MEM-10 / PR-MER-12 (simulated payment outcomes) | §2.10 Payment, §4.4 | `payments` (009) | `GET /payments/:paymentId`, `POST /payments/:paymentId/simulate` [IDEM], `GET /me/payments`, `GET /clubs/:clubId/payments` (OQ-14), `POST /dev/payments/:paymentId/simulate` | `finance/payments` (`service`, `repository`, `simulator`, `handlerRegistry`) | `/checkout/:paymentId` | T-32 | TC-PAY-01, TC-PAY-02, TC-AZ-01 |
| PR-FIN-01 (track income by type, statuses, references) | §2.10, §4.4, §4.9 | `payments`, `financial_transactions` | `GET /clubs/:clubId/payments`, `GET /clubs/:clubId/transactions` | `finance/payments`, `finance/ledger` | `/manage/:clubId/finance` | T-32, T-82, T-83 | TC-FIN-03 |
| PR-FIN-12 (auditable ledger fields) | §3.1 `financial_transactions`, §5.12 | `financial_transactions` (011) | `GET /clubs/:clubId/transactions` | `finance/ledger` | `/manage/:clubId/finance` | T-32, T-83 | TC-FIN-04, TC-FIN-05 |
| PR-FIN-13 / NFR-06 (no duplicate financial updates) | §3.2, §5.12 | `payments` partial uniques, ledger `UNIQUE(source_type, source_id)` | settle path | `finance/payments`, `finance/ledger` | — | T-32, T-90 | TC-PAY-01, TC-FIN-04 |
| PR-ANN-06 (email via configurable interface) | §2.7, §7 | `notification_deliveries` (012) | — | `notifications` (`enqueue`, templates, `DevEmailAdapter`, `UnconfiguredEmailAdapter`), `jobs/definitions/notificationDispatch.js` | — | T-50 | TC-ANN-03 |
| PR-ANN-07 (WhatsApp channel for reminders only) | §2.7, §5.3 | `notification_deliveries.channel` | — | `notifications` (`DevWhatsAppAdapter`, `UnconfiguredWhatsAppAdapter`) | — | T-50 (channel only; reminder job is G1 T-52) | TC-REM-03 (enqueue-level) |
| PR-ANN-08 / NFR-08 (delivery status, failure isolation, dev mode) | §2.7, §7, §4.6 | `notification_deliveries` | `GET /dev/outbox` (`GET /announcements/:id/deliveries` is G1) | `notifications`, `modules/dev` | `/dev` (outbox) | T-50 | TC-ANN-03 |
| PR-MEM-09 / PR-MEM-11 (Partial: job infrastructure only) | §7 | `job_runs` | `POST /dev/jobs/:jobName/run` | `jobs/*` | `/dev` | T-51 (job definitions are G1 T-52/T-53) | duplicate-run test |
| PR-EVT-06 / PR-MER-08 (Partial: hold expiry) | §7 `reservation-expiry` | `payments`, `orders`, `product_variants`, `stock_movements` | — | `jobs/definitions/reservationExpiry.js` (OQ-09) | — | T-54 (orders/stock half) | TC-MER-03 (expiry path) |

### 1.3 Merchandise (M7)

| Req | LLD | Tables | Endpoints | Backend module | FE route | Task | Tests |
|---|---|---|---|---|---|---|---|
| PDF-15 / PR-MER-01 (club catalogue, categories, sizes) | §2.8, §4.7 | `product_categories`, `products`, `product_variants` (008) | `GET/POST /clubs/:clubId/product-categories`, `GET/POST /clubs/:clubId/products`, `GET/PATCH /products/:productId`, `POST /products/:productId/variants` | `merchandise` (catalogue) | `/shop/:clubSlug`, `/manage/:clubId/merchandise` | T-60 | validation API tests, TC-AZ-01 |
| PR-MER-05 (availability, orderability) | §2.8 | `products.status`, `product_variants.is_active` | `POST /products/:productId/status`, `PATCH /variants/:variantId` | `merchandise` | `/manage/:clubId/merchandise` | T-60 | API tests (OQ-20 transitions) |
| PR-MER-03 / PR-MER-04 (member discount, offers) — Partial | §2.6 `quoteMerchItem` | `products.member_discount_eligible`, `offer_*` | `GET /clubs/:clubId/orders/quote` | `merchandise` consumes G1 `pricing` | `/shop/:clubSlug` | T-40 (G1), T-60, T-62 | TC-MER-05 (OQ-07) |
| PDF-16 / PR-MER-02 (stock per club/product/size) | §2.8 | `product_variants`, `stock_movements` | `GET /clubs/:clubId/inventory`, `POST /variants/:variantId/stock-adjustments` [IDEM] | `merchandise` (stock) | `/manage/:clubId/merchandise` | T-61 | TC-MER-01 |
| PR-MER-13 (low-stock alerts, threshold, no duplicates) | §2.8, §5.10 | `low_stock_alerts`, `notification_deliveries` | `GET /clubs/:clubId/low-stock-alerts`, `PATCH /variants/:variantId` | `merchandise` (`lowStock.evaluate`) → `notifications.enqueue` | `/manage/:clubId/merchandise` | T-61 | TC-MER-04 |
| PR-MER-06 (validate price, benefits, stock at purchase) | §5.9 | `orders`, `order_items` | `GET /clubs/:clubId/orders/quote`, `POST /clubs/:clubId/orders` [IDEM] | `merchandise` (orders) | `/shop/:clubSlug` (cart, checkout) | T-62 | TC-MER-02, TC-MER-05, PRICE_CHANGED API test |
| PR-MER-07 (decrement on payment success; order/payment/reservation lifecycle) | §2.8, §5.9 | `orders`, `product_variants`, `stock_movements` | `POST /orders/:orderId/cancel` | `merchandise/handlers/orderPaymentHandler.js` | `/me/orders/:id` | T-62 | TC-MER-03 |
| PR-MER-08 / NFR-05 (no overselling) | §3.2 | `product_variants` CHECK | `POST /clubs/:clubId/orders` | `merchandise` repository (conditional reserve) | — | T-62, T-90 | TC-MER-02 (10 consecutive runs) |
| PR-MER-09 (unique pickup identifier) | §2.8, §4.7 | `orders.pickup_code` | `POST /clubs/:clubId/pickups` [IDEM] | `merchandise` (pickups) | `/manage/:clubId/orders` | T-63 | TC-MER-06 |
| PR-MER-10 (user order history, payment status, pickup) | §4.7 | `orders`, `order_items`, `payments` | `GET /me/orders`, `GET /me/orders/:orderId` | `merchandise` | `/me/orders`, `/me/orders/:id` | T-62, T-63 | API tests |
| PR-MER-11 (club order management) | §4.7 | `orders` | `GET /clubs/:clubId/orders` | `merchandise` | `/manage/:clubId/orders` | T-63 | TC-AZ-01 |
| PR-MER-14 (units sold, revenue, order/payment history) | §5.15 | `order_items`, `orders`, `financial_transactions`, `product_variants`, `low_stock_alerts` | `GET /clubs/:clubId/reports/merchandise` | `reporting` | `/manage/:clubId/reports` | T-85 | TC-RPT-02 |
| PDF-17 (order from phones) — Partial | §6.3 | — | all merchandise endpoints | — | — (not G2, OQ-02) | T-62, T-95 | TC-E2E-01 mobile viewport (not G2-owned) |

### 1.4 Fundraisers (M8)

| Req | LLD | Tables | Endpoints | Backend module | FE route | Task | Tests |
|---|---|---|---|---|---|---|---|
| PDF-18 / PR-FUN-01 / PR-FUN-02 / PR-FUN-04 (projects, tasks, descriptions, deadlines) | §2.9, §4.8 | `fundraisers`, `fundraiser_tasks` (010) | `GET/POST /clubs/:clubId/fundraisers`, `PATCH /fundraisers/:id`, `POST /fundraisers/:id/tasks` | `fundraisers` | `/manage/:clubId/fundraisers`, `/manage/fundraisers/:id` | T-70 | API tests, TC-AZ-01 |
| PR-FUN-03 (assign to volunteers) | §2.9, §5.13 | `fundraiser_tasks.assignee_user_id` | `POST /fundraisers/:id/tasks`, `PATCH /tasks/:taskId` | `fundraisers` → `clubs.hasClubRole` | task board | T-70 | TC-FUN-02 |
| PR-FUN-05 / PR-FUN-10 / PR-ROLE-05 (status/progress; volunteers see & update own tasks) | §2.9, §4.8 | `fundraiser_tasks` | `PATCH /tasks/:taskId`, `GET /me/tasks` | `fundraisers` | `/me/tasks` | T-70 | TC-FUN-02 |
| PDF-19 / PR-FUN-06 / PR-FUN-07 / PR-FUN-08 (pending/overdue, complete vs remaining, on-track) | §2.9 formulas | `fundraiser_tasks` | `GET /fundraisers/:id/overview` | `fundraisers/domain/progress.js` | overview header, health badge | T-71 | TC-FUN-01 |
| PR-FUN-09 (income/expenses linked to fundraiser) | §2.9 money, §2.10 | `financial_transactions.fundraiser_id`, `expenses.fundraiser_id` | `GET /fundraisers/:id/overview`, `POST /clubs/:clubId/income-entries`, `POST /clubs/:clubId/expenses` | `fundraisers` + `finance/ledger` read API | overview money | T-71, T-82 | TC-FIN-03 |

### 1.5 Finance (M9)

| Req | LLD | Tables | Endpoints | Backend module | FE route | Task | Tests |
|---|---|---|---|---|---|---|---|
| PR-FIN-03 (receipt upload) | §8 | `uploaded_files` (005) | multipart on `POST /clubs/:clubId/expenses`; `GET /expenses/:id/receipt` | `finance/files` (`FileStorage`, `LocalFileStorage`) | upload field | T-80 | TC-FIN-06 |
| PDF-22 / PR-FIN-02 / PR-FIN-04 (expenses, manual amount, linked to event or fundraiser) | §2.10, §3.1 `expenses` | `expenses` (011) | `POST /clubs/:clubId/expenses` [IDEM], `GET /clubs/:clubId/expenses`, `GET /me/expenses`, `GET /expenses/:id` | `finance/expenses` | `/me/expenses`, review queue | T-81 | API tests, TC-AZ-01 |
| PR-FIN-05 / PR-ROLE-06 (review, approve/reject; separation of duties OD-06) | §2.10, §5.11 | `expenses` | `POST /expenses/:id/approve` [IDEM], `POST /expenses/:id/reject` [IDEM] | `finance/expenses` (`expenseStateMachine`) | review queue, decision dialogs | T-81 | TC-FIN-01 |
| PR-FIN-06 / PR-FIN-07 (decision, decider, time; submitted/approved/paid) | §2.10, §3.1 | `expenses.decided_*`, `paid_*` | `POST /expenses/:id/mark-paid` [IDEM] | `finance/expenses` → `ledger.post` | expense detail | T-81 | TC-FIN-02 |
| PDF-23 / PR-FIN-01 (fundraiser income) | §2.10, §4.9 | `financial_transactions` (`FUNDRAISER_INCOME`, `source_type=INCOME_ENTRY`) | `POST /clubs/:clubId/income-entries` [IDEM] | `finance/income` | income entry form | T-82 | TC-FIN-03 (OQ-15) |
| PR-FIN-08 (budgets) | §2.10, §4.9 | `budgets` (011) | `GET/POST /clubs/:clubId/budgets`, `PATCH /budgets/:budgetId` | `finance/budgets` | budgets panel | T-82 | budget tests (`BUDGET_PERIOD_OVERLAP`) |
| PDF-20 / PDF-21 / PR-FIN-09 / PR-FIN-10 / PR-FIN-11 (summary, formulas, projected balance, history) | §2.10 formulas, §4.9, §4.10 | `financial_transactions`, `expenses`, `budgets` | `GET /clubs/:clubId/finance/summary`, `GET /clubs/:clubId/transactions`, `GET /clubs/:clubId/reports/finance` | `finance/domain/formulas.js`, `reporting` | `/manage/:clubId/finance`, `/manage/:clubId/reports` | T-83 | TC-FIN-02, TC-FIN-03 |
| NFR-07 (summary = ledger sum; reconciliation) | §2.10 reconciliation | ledger, `payments`, `expenses` | `GET /clubs/:clubId/finance/reconciliation` | `finance/ledger` / `reporting` | finance page | T-83 | TC-FIN-05 |
| PR-MEM-14 (Partial: membership report) | §4.10, §5.15 | reads G1 tables `memberships`, `membership_terms`, `renewal_attempts` + ledger | `GET /clubs/:clubId/reports/memberships` | `reporting` | `/manage/:clubId/reports` | T-85 | TC-RPT-02 |
| PR-ROLE-07 / NFR-01 (Partial: authZ for every G2 endpoint) | §4.0, §4.4–4.10 | — | all G2 endpoints (§2 below) | `shared/middleware/authorize.js` + service checks | RequireCapability (G1/T-14) | each task; T-91 (OQ-12) | TC-AZ-01 rows |

### 1.6 Group 2 inputs into Group 1 requirements (not G2-owned)

| Req | G2 contribution |
|---|---|
| PDF-11 / PDF-12 / PR-EVT-15 / PR-EVT-16 (event report, G1 T-84) | Ledger `TICKET_SALE` rows with `event_id`; ledger OUT rows and `expenses` with `event_id` for `expensesPaid` / `expensesApprovedUnpaid` |
| PDF-01 / T-86 (club dashboard) | **UNOWNED — escalated** (OQ-11) |
| PDF-05, PR-MEM-09, PR-MEM-11 | `notifications.enqueue`, `runJob`, `payments.create/settle`, `ledger.post` |
| PR-ANN-05 (announcement mailing list, G1 T-55) | `notification_deliveries` table in 012 + `enqueue` |

---

## 2. Endpoint inventory (G2)

Role notation from LLD §4: CH, TR, VOL, ORG, TEAM, OWNER, AUTH, PUBLIC. Every row gets TC-AZ-01 cases: each role, same club, other club (expect 404 for other club).

| Method & path | Role | IDEM | Domain errors (besides §4.0 common) | Task |
|---|---|---|---|---|
| `GET /health` | PUBLIC | | 503 when DB down | T-11 |
| `GET /payments/:paymentId` | OWNER | | — | T-32 |
| `POST /payments/:paymentId/simulate` | OWNER, `method=SIMULATED` only | ✔ | `CONFLICT_STATE`, `FORBIDDEN` (AutoPay payment) | T-32 |
| `GET /me/payments` | AUTH | | — | T-32 |
| `GET /clubs/:clubId/payments` | TR, CH | | — | T-32 (OQ-14) |
| `GET /clubs/:clubId/product-categories` | PUBLIC | | — | T-60 |
| `POST /clubs/:clubId/product-categories` | CH | | `CATEGORY_NAME_TAKEN` 409 | T-60 |
| `GET /clubs/:clubId/products` | PUBLIC (ACTIVE); CH `?all=true` | | — | T-60 |
| `GET /products/:productId` | PUBLIC (ACTIVE) / CH | | — | T-60 |
| `POST /clubs/:clubId/products` | CH | | — | T-60 |
| `PATCH /products/:productId` | CH | | — | T-60 |
| `POST /products/:productId/status` | CH | | `CONFLICT_STATE` | T-60 |
| `POST /products/:productId/variants` | CH | | `SIZE_EXISTS` 409 | T-60 |
| `PATCH /variants/:variantId` | CH | | — | T-61 |
| `POST /variants/:variantId/stock-adjustments` | CH | ✔ | `STOCK_BELOW_RESERVED` 422 | T-61 |
| `GET /clubs/:clubId/inventory` | CH, TR | | — | T-61 |
| `GET /clubs/:clubId/low-stock-alerts` | CH | | — | T-61 |
| `GET /clubs/:clubId/orders/quote` | AUTH | | `MEMBERS_ONLY_PRODUCT`, `OUT_OF_STOCK` | T-62 |
| `POST /clubs/:clubId/orders` | AUTH | ✔ | `PRODUCT_NOT_ORDERABLE` 422, `MEMBERS_ONLY_PRODUCT` 422, `OUT_OF_STOCK` 409, `PRICE_CHANGED` 409, `TOO_MANY_ITEMS` 400 | T-62 |
| `POST /orders/:orderId/cancel` | OWNER (PENDING_PAYMENT) | | `CONFLICT_STATE` | T-62 |
| `GET /me/orders`, `GET /me/orders/:orderId` | AUTH / OWNER | | — | T-62 |
| `GET /clubs/:clubId/orders` | CH, TR | | — | T-63 |
| `POST /clubs/:clubId/pickups` | CH | ✔ | `PICKUP_CODE_NOT_FOUND` 404, `ORDER_NOT_READY` 409, `ALREADY_PICKED_UP` 409 | T-63 |
| `GET /clubs/:clubId/fundraisers` | TEAM | | — | T-70 |
| `POST /clubs/:clubId/fundraisers` | CH | | — | T-70 |
| `PATCH /fundraisers/:id` | CH | | `CONFLICT_STATE` | T-70 |
| `GET /fundraisers/:id/overview` | TEAM | | — | T-71 |
| `POST /fundraisers/:id/tasks` | CH | | `ASSIGNEE_NOT_IN_CLUB` 422, `FUNDRAISER_CLOSED` 409 | T-70 |
| `PATCH /tasks/:taskId` | CH (all); assignee (`status`, `progressPercent`) | | `FIELD_NOT_EDITABLE` 403, `CONFLICT_STATE` | T-70 |
| `GET /me/tasks` | AUTH | | — | T-70 |
| `GET /clubs/:clubId/budgets` | CH, TR | | — | T-82 |
| `POST /clubs/:clubId/budgets` | TR | | `BUDGET_PERIOD_OVERLAP` 409 | T-82 |
| `PATCH /budgets/:budgetId` | TR | | `BUDGET_PERIOD_OVERLAP` 409 | T-82 |
| `POST /clubs/:clubId/expenses` (multipart) | REIMBURSEMENT: TEAM; DIRECT: TR | ✔ | `RECEIPT_REQUIRED` 400, `UNSUPPORTED_FILE_TYPE` 415, `FILE_TOO_LARGE` 413, `EVENT_NOT_IN_CLUB` 422 | T-80, T-81 |
| `GET /clubs/:clubId/expenses` | CH, TR | | — | T-81 |
| `GET /me/expenses` | AUTH | | — | T-81 |
| `GET /expenses/:id`, `GET /expenses/:id/receipt` | CH, TR, submitter | | — | T-80, T-81 |
| `POST /expenses/:id/approve`, `/reject` | TR ≠ submitter; CH if submitter is TR | ✔ | `SELF_APPROVAL_FORBIDDEN` 403, `CONFLICT_STATE` | T-81 |
| `POST /expenses/:id/mark-paid` | TR ≠ payee; CH if payee is TR | ✔ | `SELF_PAYOUT_FORBIDDEN` 403, `CONFLICT_STATE` | T-81 |
| `POST /clubs/:clubId/income-entries` | TR | ✔ | `FUNDRAISER_NOT_IN_CLUB` 422 | T-82 |
| `GET /clubs/:clubId/transactions` | CH, TR | | — | T-83 |
| `GET /clubs/:clubId/finance/summary` | TEAM (aggregates) | | — | T-83 |
| `GET /clubs/:clubId/finance/reconciliation` | CH, TR | | — | T-83 |
| `GET /clubs/:clubId/reports/memberships` | CH, TR | | — | T-85 |
| `GET /clubs/:clubId/reports/merchandise` | CH, TR | | — | T-85 |
| `GET /clubs/:clubId/reports/finance` | CH, TR | | — | T-83 |
| `POST /dev/jobs/:jobName/run`, `GET /dev/outbox`, `POST /dev/payments/:paymentId/simulate` | dev tools only (404 otherwise) | | — | T-50, T-51, T-32 |

Not G2: `GET /clubs/:clubId/reports/events` (**UNOWNED — escalated**, OQ-11), `GET /announcements/:id/deliveries` (G1), `GET /dev/college-mock` (G1 fixture data).

---

## 3. Migrations owned by G2

Group 1 migrations 002/003/006/007 are replaced in tests and dev Compose by `backend/tests/fixtures/group1_schema.sql` when `GROUP1_SCHEMA=fixture` (OQ-01 APPROVED, `TODO(group1)`).

| File | Tables / objects | FK dependencies outside G2 | Task |
|---|---|---|---|
| `001_extensions_shared` | `pgcrypto`, `set_updated_at()`, `forbid_update_delete()` | none | T-13 |
| `004_audit_idempotency_jobs` | `audit_logs` (+ append-only trigger), `idempotency_keys`, `job_runs` | `users`, `clubs` (G1 002/003) — OQ-01 | T-13 |
| `005_uploaded_files` | `uploaded_files` | `users`, `clubs` | schema in T-32 (OQ-27); code T-80 |
| `008_merch_…` | `product_categories`, `products`, `product_variants`, `stock_movements`, `low_stock_alerts`, `orders`, `order_items` | `users`, `clubs`, `membership_terms` (G1 006) | schema in T-32 (OQ-27); code T-60–T-63 |
| `009_payments` | `payments` (+ FK `renewal_attempts.payment_id`) | `membership_terms` (006), `bookings` (007), `renewal_attempts` (006) — OQ-01, OQ-04 | T-32 |
| `010_fundraisers_tasks` | `fundraisers`, `fundraiser_tasks` | `users`, `clubs` | schema in T-32 (OQ-27); code T-70 |
| `011_budgets_expenses_ledger` | `budgets`, `expenses`, `financial_transactions` (+ immutability trigger) | `events` (007), `memberships` (006), `users`, `clubs` — OQ-03 | T-32 (whole file, OQ-03 APPROVED); code T-81, T-82 |
| `012_announcements_notifications` | `announcements` (G1 defines columns), `notification_deliveries` | `events` (007), `users`, `clubs` | T-50 |

---

## 4. Shared dependencies

### 4.1 Functions G2 calls in Group 1 modules

None of these exists yet. Step 2 creates `TODO(group1)` stubs only for the ones Step 2 code calls; the rest are stubbed in the step that first needs them. Stubs live in `backend/src/modules/<g1module>/index.js` and are listed in the Step 2 report.

| Function | Defined where | Used by (G2) | Stub allowed? |
|---|---|---|---|
| `memberships.getActiveBenefits(userId, clubId, date)` → `{membershipId, termId, planName, eventDiscountBps, merchDiscountBps, earlyBirdAccess} \| null` | LLD §2.3 | merchandise quote/order | ✔ TODO(group1) |
| `clubs.getCapabilities(userId)` → `{verifiedStudent, memberships, clubRoles, organizerOf, staffOf}` | LLD §2.2 | `authorize` (TEAM incl. organizers of club events) | ✔ TODO(group1) |
| `clubs.hasClubRole(userId, clubId, role)` | HLD §6, G2 doc §5 (not LLD §2) | `authorize`, task assignee check, expense approver selection | OQ-05 — stub in Step 2 |
| `clubs.authz.*` | IMPLEMENTATION_PLAN §4 (name only, no signature) | `authorize` | OQ-05 |
| Club heads of a club, with email (for low-stock email) | **Not defined anywhere** | `lowStock.evaluate` | OQ-06 |
| `auth.getUser(userId)` (email, phone, name, isActive) | HLD §6 (not LLD §2) | `notifications.enqueue` contact lookup, `requireAuth` | OQ-05, OQ-28 — stub in Step 2 |
| `pricing.quoteMerchItem(product, benefits, now)` + mode from config | LLD §2.6 (G1/G2 docs call it `quoteLineItem`) | merchandise quote/order | OQ-07 |
| Event existence + club lookup for `expenses.event_id` | **Not defined** (HLD §6 says "existence checks via their public API") | expenses submit/record | OQ-08 |
| `PaymentPurposeHandler` for `MEMBERSHIP_JOIN`, `MEMBERSHIP_RENEWAL`, `EVENT_TICKET` | LLD §2.10 (interface) | registered in `container.js` | Step 2: `TODO(group1)` stub handlers that record calls are registered in `container.js`; settle with an unregistered purpose → `INTERNAL_ERROR` |
| G1 job definitions `membershipExpiry`, `renewalReminders`, `autopayRenewals` | LLD §7 | `scheduler.js` | wired when files exist |
| Session/auth: `users`, `user_sessions` tables; login flow | LLD §2.1, §4.1 (G1 T-20) | every authenticated G2 endpoint and test | OQ-01, OQ-28 (fixture tables + test-only sign-in) |

### 4.2 Functions G2 exposes (frozen at CP-1)

| Function | Proposed signature | Consumers |
|---|---|---|
| `withTransaction(fn)` | `withTransaction(async (trx) => …)` | all modules |
| `audit.record` | `audit.record(trx, {actorUserId, clubId, action, entityType, entityId, metadata, requestId})` | all modules |
| `payments.create` | `create(trx, {clubId, userId, purpose, membershipTermId? \| bookingId? \| orderId?, amountPaise, method='SIMULATED'})` → payment | G1 memberships/events, merchandise, AutoPay job |
| `payments.settle` | `settle(paymentId, outcome, trx, {reason}?)` → `{payment, settled: boolean, result}` (OQ-13) | simulate endpoint, cancels, reservation-expiry, AutoPay job |
| `payments.getById` | `getById(paymentId, trx?)` | G1 |
| `payments.registerHandler` | `{purpose, onSucceeded(payment, trx), onFailed(payment, reason, trx)}` | `container.js` |
| `ledger.post` | `post(trx, {clubId, direction, category, amountPaise, sourceType, sourceId, paymentId?, expenseId?, eventId?, fundraiserId?, membershipId?, orderId?, payerUserId?, recordedBy?, approvedBy?, description, reference?, evidenceFileId?, occurredAt})` | payment handlers, expenses, income |
| `notifications.enqueue` | `enqueue(trx, [{recipientUserId, clubId?, channel, template, payload, dedupeKey, announcementId?}])` | G1 announcements/reminders/AutoPay/bookings, merchandise |
| `notifications.dispatchPending` | `dispatchPending({now})` | `notification-dispatch` job |
| `runJob` | `runJob(name, runKey \| null, fn)` | all job definitions |

---

## 5. Gaps and conflicts (summary — details and defaults in `GROUP_2_OPEN_QUESTIONS.md`)

### 5.1 Assigned by the G2 doc but not (fully) defined by the LLD

| OQ | Item |
|---|---|
| OQ-06 | Low-stock email needs "club heads of a club" — no G1 function defined |
| OQ-08 | Expense `eventId` club check — no events function defined |
| OQ-09 | `reservationExpiry.js` is listed as owned by both groups; LLD §7 makes it purely payment-driven |
| OQ-13 | `settle` has no `reason` parameter, yet cancel/expiry flows need `USER_CANCELLED` / `EXPIRED`; handler return value (`result` in the simulate response) is undefined |
| OQ-15 | Income entries have no table; `source_id` for `source_type=INCOME_ENTRY` is undefined |
| OQ-16 | Ledger `occurred_at` for payouts, direct expenses and income entries is undefined |
| OQ-17 | Notification retry schedule: "3 attempts then FAILED" vs "+1/+5/+30 min" (third delay can never run) |
| OQ-18 | Notification templates for G1 events (`RENEWAL_REMINDER_7D`, `AUTOPAY_RESULT`, `BOOKING_CONFIRMED`, `ANNOUNCEMENT`) — G2 renders them but payload shapes are undefined |
| OQ-19 | Order total of 0 (100 % member discount) violates `orders.total_paise > 0` and `payments.amount_paise > 0`; no free-order path or error code |
| OQ-20 | Product status transition table is missing |
| OQ-21 | Separation-of-duties edge cases: multiple treasurers; one person holding both CH and TR |
| OQ-22 | Display names in list endpoints require reading `users` (G1 table) from G2 repositories |
| OQ-23 | Idempotency key stuck "in progress" after a crash; which responses are stored |
| OQ-24 | `GET /payments/:paymentId` returns a "target summary" that payments cannot build without importing domain modules |
| OQ-25 | Module cycles: finance/expenses → events/fundraisers, while events/fundraisers → finance |
| OQ-27 | 009 and 011 have FKs into 005, 008 and 010 — those ship as schema in Step 2 |
| OQ-28 | No login yet: shared session + `requireAuth` over a `TODO(group1)` `auth.getUser`; tests sign in via a test-only route |
| OQ-31 | AutoPay payment on the owner simulate endpoint: 403 code unspecified → `FORBIDDEN` |
| OQ-32 | `INITIATED → PENDING` simulate has no side effects |
| OQ-33 | Backstop constraints added beyond LLD §3.1 (composite club FKs, ledger currency CHECK, NOT NULL on enums) |
| OQ-34 | No LLD code for a missing `X-Requested-With` → `FORBIDDEN` |
| OQ-35 | ESLint not in the allowed dependencies → lint = dependency-cruiser + syntax + grep test |
| OQ-36 | Simulate after hold time but before the expiry job runs |
| OQ-37 | Compose/env specifics (no frontend service, DB port 5433, no seeds yet) |
| OQ-56…OQ-67 | Step 4 defaults (job retry, movement signs, pickup-code visibility, `{trx}` on Group 1 lookups, members-only listing, product audit, low-stock points, announcement delete, expiry scope, finance report shape, test pricing double) — see open questions |
| OQ-38…OQ-54 | Step 3 defaults (TEAM organizers, task/fundraiser edge rules, rounding, date checks, approve/pay asymmetry, summary details, multipart idempotency, deferred finance report) — see open questions |

### 5.2 Defined by the LLD but not assigned by the G2 doc

| OQ | Item |
|---|---|
| OQ-11 | **UNOWNED — escalated:** `GET /clubs/:clubId/reports/events` and T-86 (club dashboard) assigned to neither group; T-91 (full authZ matrix), T-94 (E2E), T-100–T-102 unassigned |
| OQ-14 | `GET /clubs/:clubId/payments` (LLD §4.4) not in the G2 doc's route list — assumed G2 (payments module) |
| OQ-02 | **APPROVED: backend only.** Frontend screens: the G2 doc is backend-only and lists no screens, but IMPLEMENTATION_PLAN gives G2 tasks frontend deliverables; T-14 (frontend core) is "pair" in the G1 doc but absent from the G2 doc |

### 5.3 Conflicts between documents

| OQ | Conflict |
|---|---|
| OQ-01 | **APPROVED (fixture).** G2 migrations 004/005/008–012 have FKs to G1 tables (`users`, `clubs`, `membership_terms`, `bookings`, `events`). The G2 doc says T-13 ships "before auth", which is impossible for 004 as specified. No G1 code exists. |
| OQ-03 | T-32 needs `financial_transactions` (migration 011), but 011 also holds `expenses`/`budgets`, which depend on 005, 010 and G1's 007. 011 cannot be shipped "ledger part only" without later editing a merged migration. |
| OQ-04 | LLD §3.1 says the `renewal_attempts.payment_id` FK is added in migration 008; LLD §3.5 says 009. |
| OQ-07 | Pricing function name: LLD `quoteMerchItem` vs G1/G2 docs `quoteLineItem`; TC-MER-05 (G2-assigned) tests G1's PricingPolicy. |
| OQ-10 | Master prompt §5 lists TC-RPT-01; the G2 doc assigns TC-RPT-01 to G1 (event report) and only TC-RPT-02 to G2. |
| OQ-12 | Branch naming: master prompt `group2/<task-id>` vs G2 doc `g2/T-nn-short-name`. |
| OQ-26 | Process gate: IMPLEMENTATION_PLAN puts T-00 (Codex review) and T-01 (OD approvals) before T-10; neither is done. Master prompt says to proceed with OD defaults behind config. |

---

## 6. Task order (approved)

Step 2 = T-10, T-11, T-12, T-13, T-15, T-24, T-32 (done). Step 3 = T-70, T-71, T-80, T-81, T-82, T-83 (done; `GET /clubs/:clubId/reports/finance` deferred, OQ-52). Later steps = the rest. Step 4 = finance report (`GET /clubs/:clubId/reports/finance`), T-50, T-51, T-60, T-61, T-62, T-63 and the orders half of T-54 (the job itself is purpose-agnostic, OQ-64). Not yet built: T-85 (merchandise/membership reports, TC-RPT-02), T-90, T-92, T-93.

T-10 → T-11 → T-12 → T-13 → T-15 → T-24 → **T-32** → T-50 ∥ T-51 → T-60 → T-61 → T-62 → T-63 → T-54 (orders half) → T-70 → T-80 → T-81 → T-82 → T-71 → T-83 → T-85 → T-90 → T-92 → T-93.

T-71 moves after T-82 because its money figures read `FUNDRAISER_INCOME` ledger rows (plan dependency T-71 → T-81).

## 7. Tests owned (from G2 doc §12 + master prompt §5)

TC-PAY-01, TC-PAY-02, TC-MER-01…06 (TC-MER-05: OQ-07), TC-FIN-01…06, TC-FUN-01, TC-FUN-02, TC-RPT-02, TC-ANN-03, TC-REM-03 (enqueue/dispatch level), TC-AZ-01 rows for every endpoint in §2. Concurrency (real PostgreSQL, separate connections, 10 consecutive passes): TC-PAY-01, TC-MER-02, TC-FIN-04 (ledger idempotency under concurrent settle), TC-FIN-05 run after the concurrency suite. Not owned: TC-RPT-01 (OQ-10), TC-EVT-*, TC-PRC-* (G1).
