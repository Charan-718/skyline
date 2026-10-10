# Group 2 Open Questions and Defaults

| Field | Value |
|---|---|
| Document | `docs/GROUP_2_OPEN_QUESTIONS.md` |
| Status | Step 1 approved 2026-10-10. Items marked **APPROVED** are binding decisions from the Step 2 master prompt (§A); the rest keep their stated default. |
| Related | `docs/GROUP_2_SCOPE_MAP.md` §5 |

**Blocking** = cannot start the affected task without a decision. **Default-safe** = work proceeds with the stated default, isolated so a different answer is cheap to apply.

## Decision log (Step 2 master prompt §A)

| OQ | Status | Decision |
|---|---|---|
| OQ-01 | **APPROVED** | Group 2 migrations follow LLD §3.5 numbering and columns exactly. `backend/tests/fixtures/group1_schema.sql` creates only the 16 Group 1 tables Group 2 references. `knexfile.js` lists 002/003/006/007 under `group1Migrations`. `GROUP1_SCHEMA=fixture` applies the fixture in their place (tests, dev Compose); `GROUP1_SCHEMA=external` skips them; default `migrations` runs them. A test compares fixture columns with LLD §3.1. All marked `TODO(group1): delete when Group 1 merges`. |
| OQ-02 | **APPROVED** | Backend only. No screens; no frontend API client stubs. |
| OQ-03 | **APPROVED** | All of 011 ships in T-32; only ledger + payment code runs in Step 2. See OQ-27 for 005/008/010. |
| OQ-07 | **APPROVED** | TC-MER-05 is `it.skip` ("requires Group 1 PricingPolicy"). No substitute pricing in Group 2. |
| OQ-10 | **APPROVED** | Group 2 doc decides TC ownership: TC-RPT-01 is Group 1. |
| OQ-11 | **APPROVED** | Not Group 2. Listed in the scope map as "UNOWNED — escalated". |
| OQ-12 | **APPROVED** | Branch `group2/<task-id>`; no push; commit only on request. |
| OQ-21 | **APPROVED** | One function `approvalPolicy.canApprove(actor, expense, club)` in the finance domain; every combination unit-tested (Step 3). |
| OQ-26 | **APPROVED** | Proceed; each OD default behind one config value. |
| OQ-35 | **APPROVED** (Step 3 §A1) | ESLint 9.39.1 + @eslint/js 9.39.1 (devDependencies), flat config, recommended rules only. `npm run lint` = ESLint + dependency-cruiser + the no-float grep test. |
| Step 3 scope | **APPROVED** (Step 3 §A2) | T-70, T-71, T-80, T-81, T-82, T-83 only. |
| OQ-08 | **APPROVED** (Step 3 §A4) | Expense event check through the `TODO(group1)` stub `events.getEventClub(eventId)`; Group 2 services never query Group 1 tables. |
| OQ-21 | **APPROVED** (Step 3 §B4), superseding the Step 1 default | `approvalPolicy.canApprove`: approver ≠ submitter; a treasurer's claim → club head **or another treasurer**; a club head who is also treasurer → only another club head; anyone else's claim → a treasurer. `canPay`: payee ≠ payer; payee is a treasurer → club head only; otherwise a treasurer. See OQ-44. |
| OQ-44 | **APPROVED** (after Step 3) | Payouts follow the approval rule: any treasurer who is not the payee may mark paid; a treasurer's claim → club head or another treasurer; a head-and-treasurer payee → another club head. |
| OQ-53 | **APPROVED** (after Step 3) | New expense or income links to a COMPLETED/CANCELLED fundraiser → 409 `FUNDRAISER_CLOSED` (`details.fundraiserStatus`). Club check first (`FUNDRAISER_NOT_IN_CLUB`). |
| OQ-38 | **APPROVED** (after Step 3) | Event organizers count as TEAM only for `GET /clubs/:clubId/finance/summary`. Fundraiser list and overview are club role holders only. Reimbursement submission keeps organizers because LLD §2.10 names them explicitly (see OQ-55). |
| OQ-52 | **APPROVED** (after Step 3) | `GET /clubs/:clubId/reports/finance` is the first task of Step 4. |
| OQ-59 | **APPROVED** (after Step 4) | `auth.getUser(userId, { trx }?)` and `clubs.listRoleHolders(clubId, role, { trx }?)` must use the caller's transaction. Contract: `backend/tests/contracts/group1Trx.contract.js`; Group 1 checks its code with `npm run test:contract:group1`. |
| OQ-60 | **APPROVED** (after Step 4) | Members-only products stay visible to non-members with `membersOnly: true`; ordering stays blocked (`MEMBERS_ONLY_PRODUCT`). |
| OQ-55 | **APPROVED** (after Step 4) | Organizers of a club event may submit reimbursements (LLD §2.10). |
| OQ-64, OQ-66 | **ACCEPTED until Group 1 merges** | Current defaults stand; revisit when Group 1's handlers and club lookup exist. |
| OQ-22 | **REVISED** (Step 3 §A4 spirit) | Display names come from the `TODO(group1)` stub `auth.getUsersByIds`, not from joins on `users`. |


## Blocking

### OQ-01 — Group 1 tables do not exist, and G2 migrations depend on them — APPROVED (see decision log)
- **Sources:** LLD §3.5 orders 004 after 002/003 (G1). The G2 doc (§3) says T-13 ships "before auth". Every club-scoped G2 table has FKs to `users`/`clubs`; 008/009/011/012 also reference `membership_terms`, `bookings` and `events` (G1 006/007). The repo has no G1 code. Every authenticated G2 endpoint also needs `users` + `user_sessions` + a login path, all G1 (T-20).
- **Options:**
  - (a) Wait for G1 migrations 002/003/006/007 to merge before G2 migrations 004+.
  - (b) G2 ships 001 and the shared code now. For 004 onwards, G2 writes the migrations exactly as specified and they run only once G1's migrations exist. Tests use G1 migrations as soon as they land.
  - (c) G2 writes minimal G1 migrations 002/003 (and the 006/007 columns G2 references) marked `TODO(group1)` for G1 to take over. This goes beyond master prompt §0.8, which allows interface stubs only.
- **Decision:** fixture + `GROUP1_SCHEMA` switch (decision log).

### OQ-02 — Frontend scope — APPROVED
- **Sources:** master prompt §3f ("only the screens the Group 2 doc lists") and title ("Implement Group 2 **backend**"). The G2 doc lists no screens. IMPLEMENTATION_PLAN gives G2 tasks frontend columns (checkout, My payments, shop/cart, inventory, orders, fundraisers, finance, reports, dev outbox/job runner). T-14 (frontend core) is "pair" in the G1 doc and absent from the G2 doc.
- **Decision:** backend only. Frontend API client stubs are out of scope too.

## Default-safe

### OQ-03 — Migration 011 cannot ship "ledger part only" — APPROVED
- **Sources:** IMPLEMENTATION_PLAN T-32 "`financial_transactions` (011 ledger part)"; LLD §3.5 puts `budgets`, `expenses` and the ledger in 011. `expenses` needs 005, 010 and G1's `events`. Merged migrations must never be edited.
- **Default:** ship 005, 010 and the whole of 011 as schema during T-32, in LLD order. Service code for expenses and budgets still lands in T-81/T-82. This keeps the LLD numbering without editing merged files.

### OQ-04 — `renewal_attempts.payment_id` FK: migration 008 or 009?
- **Sources:** LLD §3.1 says 008; LLD §3.5 says 009. `payments` is created in 009.
- **Default:** 009. LLD §3.1 should be corrected.

### OQ-05 — G1 functions named in HLD/plan but not specified in LLD §2
- **Items:** `clubs.hasClubRole`, `clubs.authz.*`, `auth.getUser`.
- **Default:** G2 writes `shared/middleware/authorize.js` against these signatures, marked `TODO(group1)`, with test stubs: `clubs.hasClubRole(userId, clubId, roles[]) → boolean` and `auth.getUser(userId) → {id, fullName, email, phoneE164, isActive} | null`. G1 confirms or renames at CP-1.

### OQ-06 — Recipients for the low-stock email
- **Sources:** LLD §2.8 / §5.10 say "email club heads". No function returns a club's heads.
- **Default:** propose `clubs.listRoleHolders(clubId, role) → [{userId}]` as a `TODO(group1)` stub. Contact details come from `auth.getUser`.

### OQ-07 — Pricing function name and TC-MER-05 ownership — APPROVED
- **Sources:** LLD §2.6 `quoteMerchItem(product, benefits, now)`; the G1 doc §5 and G2 doc §16 say `quoteLineItem`. PricingPolicy is G1 (T-40), but TC-MER-05 is in the G2 test list. The LLD pseudocode for the `OFFER` vs `MEMBER_DISCOUNT` rule in `BEST_OF` mode is also loose.
- **Default:** call `pricing.quoteMerchItem` (LLD name) through a `TODO(group1)` interface. G2 writes the TC-MER-05 cases as a spec. They become meaningful only against G1's real implementation, and stay marked pending until then.

### OQ-08 — Validating `expenses.event_id` belongs to the club
- **Sources:** LLD §3.1 says "enforced in service"; HLD §6 says "existence checks via their public API". No events function is defined.
- **Default:** propose `events.getEventClubId(eventId) → clubId | null` as a `TODO(group1)` stub, injected through `container.js` (see OQ-25).

### OQ-09 — Who owns `reservationExpiry.js`
- **Sources:** both group docs list the file. LLD §7 defines the job purely as expiring `INITIATED/PENDING` payments via `settle(EXPIRED)`. The handlers do the releasing.
- **Default:** G2 owns the file (payment-driven). G1 owns the `onFailed` side effects in its handlers. Hold rule:
  - `SIMULATED` payments expire when `created_at + RESERVATION_HOLD_MINUTES` has passed. `orders.hold_expires_at` is set to the same instant.
  - `SIMULATED_AUTOPAY` payments that are `PENDING` expire after `AUTOPAY_PENDING_TIMEOUT_HOURS`.

### OQ-10 — TC-RPT-01 — APPROVED
- **Sources:** master prompt §5 lists it; the G2 doc assigns it to G1 (T-84, event report).
- **Default:** G1 owns it. G2 provides the expense and ledger data it reads.

### OQ-11 — Work assigned to neither group — APPROVED (UNOWNED — escalated)
- **Items:** `GET /clubs/:clubId/reports/events`, T-86 (club dashboard), T-91 (full authZ matrix), T-94 (E2E), T-100–T-102.
- **Default:** G2 leaves these out and adds TC-AZ-01 rows only for its own endpoints.

### OQ-12 — Branch naming — APPROVED
- **Sources:** master prompt `group2/<task-id>`; G2 doc `g2/T-nn-short-name`.
- **Default:** `group2/<task-id>` (your direct instruction), e.g. `group2/T-32`.

### OQ-13 — `settle` signature and handler return value
- **Sources:** LLD §2.10 `settle(paymentId, outcome, trx)`. The cancel and expiry flows need `failure_reason` (`USER_CANCELLED`, `EXPIRED`, `EVENT_CANCELLED`), and `onFailed(payment, reason, trx)` takes a reason. The simulate response example includes `result` (e.g. `membershipStatus`), which the handler interface does not return.
- **Default:**
  - Signature: `settle(paymentId, outcome, trx, { reason } = {})`.
  - `failure_reason` stores `reason` (or the outcome).
  - Handlers may return a plain object, which becomes `result`.
  - A replay on a terminal payment returns `result: null`. Idempotency-Key replays return the stored original response.

### OQ-14 — `GET /clubs/:clubId/payments`
- **Default:** G2 implements it (payments module; traceability PR-FIN-01).

### OQ-15 — Income entries have no table
- **Sources:** LLD §4.9 says "201 ledger row"; ledger `source_type = INCOME_ENTRY` needs a `source_id`. No `income_entries` table exists.
- **Default:** generate `source_id = gen_random_uuid()` per entry, so the ledger row is the record. Duplicate submission is prevented by Idempotency-Key. Reconciliation check (d) does not apply to `INCOME_ENTRY` rows. Evidence files use `uploaded_files.purpose = 'RECEIPT'` (the only allowed value).

### OQ-16 — Ledger `occurred_at` for manual entries
- **Default:**
  - Payments: `settled_at`.
  - Reimbursement payout: `paidOn`, as 00:00 IST. `paidOn` must be ≤ today (IST) and ≥ `incurredOn`. `expenses.paid_at` = now().
  - Direct expense: `incurredOn`, as 00:00 IST.
  - Income entry: `receivedOn`, as 00:00 IST, and must be ≤ today.

### OQ-17 — Notification retry schedule
- **Sources:** LLD §2.7 and HLD §10.1 give delays of +1/+5/+30 min but also "FAILED after 3 failed attempts". TC-ANN-03 expects attempts = 3, then FAILED.
- **Default:** 3 attempts in total, with +1 min after the 1st failure and +5 min after the 2nd. The +30 min delay is unused. `NOT_CONFIGURED` → FAILED immediately.

### OQ-18 — Template payload shapes
- **Default:** G2 publishes a zod schema per template at CP-1. G1 fills payloads for its templates.
- `SKIPPED` deliveries record the reason in `last_error` (`NO_CONTACT`), because there is no dedicated column.

### OQ-19 — Merchandise order total of 0
- **Sources:** `merchDiscountBps` may be 10000, but `orders.total_paise > 0` and `payments.amount_paise > 0`. No free-order path or error code exists.
- **Default:** reject with 422 `PRODUCT_NOT_ORDERABLE`, `details.reason = 'ZERO_TOTAL'`. No free-order path is invented.

### OQ-20 — Product status transitions
- **Default:**
  - `DRAFT → ACTIVE | ARCHIVED`
  - `ACTIVE → INACTIVE | ARCHIVED`
  - `INACTIVE → ACTIVE | ARCHIVED`
  - `ARCHIVED` is terminal
  - Anything else returns `CONFLICT_STATE`. There is no delete endpoint (none in LLD §4.7).

### OQ-21 — Separation-of-duties edge cases (OD-06) — APPROVED
- **Default:**
  - If the submitter (or payee) holds `TREASURER` in the club, only a `CLUB_HEAD` who is a different person may approve, reject or mark paid. Another treasurer may not.
  - Otherwise, any `TREASURER` other than that person may.
  - If no eligible person exists (e.g. the sole CH is also the TR who submitted), the claim stays `SUBMITTED`. This is reported as a known limitation.

### OQ-22 — Display names in G2 list endpoints
- **Sources:** transactions (recordedBy/approvedBy names), club orders, tasks (assignee), expenses all need names from G1's `users` table.
- **Default:** read-only join on `users(id, full_name)` inside G2 repositories, for display only, documented as a deviation. The alternative is a batch `auth.getUsersByIds` API.

### OQ-23 — Idempotency edge cases
- **Default:**
  - Store responses with 2xx and 4xx status. On 5xx, delete the key so the client can retry.
  - An in-progress row older than 60 s (`locked_at`) is treated as abandoned and may be retaken.
  - Expiry is 24 h.

### OQ-24 — "Target summary" on `GET /payments/:paymentId`
- **Default:** return `target: { type, id }` only. Payments must not import domain modules. A richer summary would need a `describe()` method added to the handler interface (G1 change).

### OQ-25 — Module dependency cycles
- **Problem:** `events → finance` (payments/ledger), but `finance/expenses → events` (club check). Likewise `fundraisers → finance` (ledger sums) and `finance → fundraisers` (fundraiser club check).
- **Default:** inject these lookups as functions from `container.js`, not imports. dependency-cruiser `no-circular` stays enforced.

### OQ-26 — Process gate — APPROVED
- **Sources:** IMPLEMENTATION_PLAN puts T-00 (Codex review) and T-01 (OD approvals) before T-10. Neither is done.
- **Default:** proceed per the master prompt. Each OD default sits behind one config value or module and is listed in the final report.

### OQ-27 — Migrations 005, 008 and 010 ship as schema in Step 2
- **Sources:** LLD §3.1: `payments.order_id` → `orders` (008); `expenses.receipt_file_id` → `uploaded_files` (005); `expenses.fundraiser_id` → `fundraisers` (010). Decision OQ-03 ships 009 and all of 011 now, and merged migrations must never be edited.
- **Default:** ship 005, 008 and 010 exactly per LLD §3.1 as schema only. No merchandise, fundraiser or file code runs in Step 2.

### OQ-28 — Authentication for Group 2 endpoints before Group 1 auth exists
- **Sources:** `requireAuth` needs a session; login is Group 1 (T-20). LLD §1.1 puts `session.js` and `requireAuth.js` in `shared/middleware`.
- **Default:** G2 wires `express-session` + `connect-pg-simple` on `user_sessions` and a `requireAuth` that reads `req.session.userId` and loads the user via `auth.getUser` (`TODO(group1)` stub). API tests sign in through a test-only route mounted by `tests/helpers/testApp.js`; it does not exist in `src/`. Group 1 replaces the stub and adds login in T-20.

### OQ-29 — Node 20 toolchain versions
- **Sources:** master prompt §2 says Node 20. Vitest 5 and dependency-cruiser 17+ require Node 22+.
- **Default:** pin Vitest 3.2.x and dependency-cruiser 16.x, which support Node 20. Tests run inside the `node:20-alpine` container (`docker compose run --rm backend npm test`).

### OQ-30 — `pg` driver and branch for Step 2
- **Default:** `pg` is added as Knex's PostgreSQL driver (implied by "Knex + PostgreSQL"; no alternative). Step 2 (T-10…T-32) is worked on one branch, `group2/T-32`, because nothing is committed between tasks.

### OQ-31 — Simulating a `SIMULATED_AUTOPAY` payment through the owner endpoint
- **Sources:** LLD §4.4 lists "AUTOPAY payment → 403" in the errors column of `POST /payments/:paymentId/simulate` without a code.
- **Default:** 403 `FORBIDDEN` with `details.reason = 'AUTOPAY_PAYMENT'`. AutoPay payments are resolved only by `POST /dev/payments/:paymentId/simulate` (dev tools).

### OQ-32 — `PENDING → PENDING` simulate
- **Sources:** LLD §4.4 "PENDING→PENDING ok".
- **Default:** returns 200 with the unchanged payment, no side effects. `INITIATED → PENDING` updates status only (no handler, no ledger, `settled_at` stays NULL).

### OQ-33 — Constraints added beyond LLD §3.1 in Step 2 migrations
- **What:** small backstops that make the LLD's stated guarantees hold:
  - `orders` UNIQUE (`id`, `club_id`), and `order_items` composite FK (`order_id`, `club_id`) → `orders`. LLD §3.1 says the variant FK "guarantees the item belongs to the order's club"; that only holds if the item's `club_id` is also tied to the order.
  - `stock_movements` and `low_stock_alerts`: composite FK (`variant_id`, `club_id`) → `product_variants`.
  - `financial_transactions.currency` CHECK = 'INR' (LLD §3.2 "currency fixed INR").
  - FKs on the ledger's related ids (`event_id`, `fundraiser_id`, `membership_id`, `order_id`).
  - `NOT NULL` on status/enum columns the LLD lists with a CHECK but without nullability.
  - `stock_movements` append-only trigger (LLD: "Append-only").
- **Default:** keep them. They reject only data the LLD already forbids.

### OQ-34 — Error code for a missing `X-Requested-With` header
- **Sources:** ADR-004 requires the header; LLD §4.0 has no code for it.
- **Default:** 403 `FORBIDDEN`, `details.reason = 'CSRF_HEADER_MISSING'`.

### OQ-35 — Lint tooling
- **Sources:** T-10 asks for "lint/format"; ESLint/Prettier are not in master prompt §2.
- **Default:** no new dependency. `npm run lint` = dependency-cruiser (module boundaries) + `node --check`; money rules are enforced by the grep test `tests/unit/noFloatMoney.test.js` and a DB test that every `*_paise` column is BIGINT. Adding ESLint needs your approval.

### OQ-36 — Simulating a payment after its hold has passed
- **Sources:** LLD §4.4 and §7 are silent. Until `reservation-expiry` (T-54) runs, an owner could still simulate SUCCEEDED on a payment whose hold time has passed.
- **Default:** allowed in Step 2; the expiry job closes the window (at most one minute in normal operation). Revisit in T-54.

### OQ-37 — Compose and environment specifics
- **Default:**
  - Compose runs `db` + `backend` only (no frontend service; OQ-02).
  - Host DB port defaults to 5433 (`DB_PORT`) because 5432 is often taken.
  - The entrypoint runs `knex migrate:latest` and starts the server; seeds are not run (they need Group 1 data; `SEED_ON_START` is reserved for T-93).
  - `payments.created_at` is set from the injectable clock so holds and tests use one time source.

## Step 3 additions (status OPEN; default in force)

### OQ-38 — TEAM includes organizers of a club's events — APPROVED
- **Sources:** LLD §4.0 `TEAM(club) = CH ∪ TR ∪ VOL ∪ ORG of any event of the club`; reimbursements may be submitted by "organizer of a club event". No Group 1 function answers this.
- **Default:** `TODO(group1)` stub `events.isClubEventOrganizer(userId, clubId) → boolean`, used by `shared/access.js`.

### OQ-39 — Closed fundraisers are read-only — OPEN
- **Default:** PATCH on a COMPLETED/CANCELLED fundraiser → 409 `CONFLICT_STATE`; creating or updating its tasks → 409 `FUNDRAISER_CLOSED`.

### OQ-40 — Who may update a task — OPEN
- **Default:** the club head, or the assignee **while they hold an active club role**. Anyone else (including a treasurer of the same club, or an assignee whose role was revoked) gets 404, per TC-FUN-02 "other's task 404". Assignee-only transitions: start, progress, complete. Reopen and cancel are club-head only (403 `FORBIDDEN` for the assignee).

### OQ-41 — `timeElapsedPct` window and AT_RISK comparison — OPEN
- **Sources:** LLD §2.9 `(now − startsOn) / (targetDate − startsOn)` on calendar dates; zero when `startsOn = targetDate`.
- **Default:** start = 00:00 IST of `startsOn`, end = 00:00 IST of the day after `targetDate` (end of the target day). The displayed `timeElapsedPct` is rounded half-up; the AT_RISK test compares the exact ratio (`progressPct·total < 100·elapsed − tolerance·total`).

### OQ-42 — Rounding of `progressPct` and `goalPct` — OPEN
- **Default:** both are integers rounded half-up (`round()` in LLD §2.9; `goalPct` unspecified), computed with integer arithmetic only.

### OQ-43 — Date checks on expenses and income — OPEN
- **Default:** `incurredOn ≤ today` and `receivedOn ≤ today` (IST); `paidOn ≤ today` and `paidOn ≥ incurredOn` (extends OQ-16). Violations → 400 `VALIDATION_FAILED`.

### OQ-44 — Approve vs pay asymmetry for a treasurer's claim — APPROVED
- **Sources:** Step 3 §B4 lets another treasurer **approve** a treasurer's claim, but the `canPay` rule says "club head if payee is treasurer".
- **Default:** implemented literally. A second treasurer may approve a treasurer's claim but only a club head may mark it paid. Confirm or extend the several-treasurers rule to payouts.

### OQ-45 — A club head who is not a treasurer and a volunteer's claim — OPEN
- **Sources:** LLD §4.9 approve/mark-paid: "TR (≠ submitter) / CH if submitter is TR".
- **Default:** literal. A club head without the treasurer role cannot approve, reject or pay an ordinary volunteer's claim (403).

### OQ-46 — Reading expenses and receipts — OPEN
- **Default:** CH, TR, or the submitter (even after the submitter's role is revoked). Other same-club TEAM members (volunteers, organizers) → 403; outsiders → 404.

### OQ-47 — Upload size boundary — OPEN (implementation note)
- **Default:** busboy flags a file that *reaches* its limit, so multer is capped at `MAX_UPLOAD_BYTES + 1` and the service rejects anything above `MAX_UPLOAD_BYTES`. A file of exactly 5 242 880 bytes is accepted; 5 242 881 → 413.

### OQ-48 — Task transitions the LLD table omits — OPEN
- **Default:**
  - `IN_PROGRESS → TODO` → `CONFLICT_STATE`.
  - CANCELLED tasks are read-only.
  - On a DONE task, changing progress without reopening → `CONFLICT_STATE`.
  - Reopening keeps the current progress unless a new value is sent.
  - DONE always stores 100.

### OQ-49 — Finance summary details — OPEN
- **Default:**
  - `approvedUnpaidTotal` and `pendingReviewTotal` are all-time (current liabilities), not period-filtered.
  - `activeBudget` is the budget covering today (IST), or null.
  - `monthly` buckets ledger rows by IST month within the period.
  - `from`/`to` are inclusive IST dates.

### OQ-50 — Idempotency of multipart requests — OPEN
- **Default:** the request hash covers the form fields plus the SHA-256 of the uploaded file. The same key with a different file → `IDEMPOTENCY_KEY_REUSED`.

### OQ-51 — Fundraiser changes are not audited — OPEN
- **Sources:** the LLD §9 audit list has no `FUNDRAISER_*` / task actions.
- **Default:** not audited. Expense, income and budget actions are audited exactly as listed.

### OQ-52 — `GET /clubs/:clubId/reports/finance` — APPROVED
- **Sources:** the scope map lists it beside T-83; Step 3 §A2 excludes reports.
- **Default:** deferred to the reporting task (T-85 area). The same figures are available from `GET /finance/summary`.

### OQ-53 — Income for, or expenses linked to, a closed fundraiser — APPROVED
- **Default:** allowed. The LLD sets no rule, and a cancelled fundraiser may still have money to account for.

### OQ-54 — Reconciliation check (d) with a missing source — OPEN
- **Default:** a ledger row whose PAYMENT/EXPENSE source row is missing counts as a mismatch, the same as an unsettled source.

### OQ-55 — Organizers submitting reimbursements — APPROVED
- **Sources:** OQ-38 (organizers are TEAM only for the summary) vs LLD §2.10 ("any club role holder or organizer of a club event" may submit).
- **Default:** organizers may still submit reimbursements, and read them as the submitter. Every other finance or fundraiser endpoint treats an organizer without a club role as same-club non-member staff: 403. Say if organizers should lose reimbursement submission too.

## Step 4 additions (status OPEN; default in force)

### OQ-56 — Retrying a failed daily job on the same day — OPEN
- **Sources:** LLD §7: `job_runs` UNIQUE (`job_name`, `run_key`); "next day re-run catches up".
- **Default:** a FAILED run row for the same key is retaken (set back to RUNNING), so a transient failure can be retried the same day. SUCCEEDED or RUNNING rows give `ALREADY_RAN`.

### OQ-57 — Sign of stock movement quantities — OPEN
- **Sources:** LLD §2.8 "signed `quantity`" without a convention.
- **Default:** signed against the counter each movement changes:
  - RESTOCK +q and ADJUSTMENT ±q (on hand)
  - RESERVE +q and RELEASE −q (reserved)
  - SALE −q (on hand; the reservation is consumed in the same statement)

### OQ-58 — Pickup codes in the club order list — OPEN
- **Default:** codes are shown only to the buyer (`/me/orders`, simulate result). The club list (CH, TR) omits them, so the desk verifies a code the buyer presents and cannot read it off the list. `?q=` matches a pickup-code prefix.

### OQ-59 — Group 1 lookups inside Group 2 transactions take `{ trx }` — APPROVED
- **Finding:** under 30 parallel orders the low-stock path ran `clubs.listRoleHolders` and `auth.getUser` on a second pool connection while its transaction held one. Every transaction waited for a connection and the pool starved (test timeout).
- **Default:** both interfaces take an optional `{ trx }` and must use it: `auth.getUser(userId, { trx }?)`, `clubs.listRoleHolders(clubId, role, { trx }?)`. Group 1 should keep this when implementing them (CP-1).

### OQ-60 — Members-only products in the public catalogue — APPROVED
- **Sources:** LLD §4.7 lists ACTIVE products publicly; the plan says "non-member visibility per flag".
- **Default:** members-only products are listed for everyone with `membersOnly: true`. Ordering is blocked by PricingPolicy (`MEMBERS_ONLY_PRODUCT`), and a signed-in non-member sees `displayPrice: null`. Say if they should be hidden from non-members instead.

### OQ-61 — Product audit actions — OPEN
- **Sources:** LLD §9 "`PRODUCT_*`".
- **Default:** `PRODUCT_CREATED`, `PRODUCT_UPDATED` (price changes carry before/after), `PRODUCT_STATUS_CHANGED`, `PRODUCT_VARIANT_ADDED`, `PRODUCT_VARIANT_UPDATED`, plus `STOCK_ADJUSTED` and `ORDER_PICKED_UP`. Category creation and order placement are not audited (not in the list).

### OQ-62 — Low-stock evaluation points — OPEN
- **Default:** exactly the LLD §5.10 list: reserve, release, sale, restock, adjustment and threshold or active-flag change. Creating a product or adding a size does not open alerts. An ADJUSTMENT can never take on-hand below reserved or below 0 (`STOCK_BELOW_RESERVED`).

### OQ-63 — Published announcements and DELETE — OPEN
- **Default:** the migration 012 trigger blocks UPDATE **and DELETE** of a PUBLISHED row (LLD names UPDATE; deletion would also erase the record). Drafts can be edited and deleted.

### OQ-64 — `reservation-expiry` covers every purpose — ACCEPTED (until Group 1 merges)
- **Default:** the job is payment-driven (OQ-09) and settles any expired payment. Group 2's MERCH_ORDER handler releases stock. Group 1 handlers do bookings and terms. Until Group 1 registers an EVENT_TICKET handler, such a payment would fail to expire and is counted as `failed` in the summary (none can exist without Group 1 bookings).

### OQ-65 — Finance report shape — OPEN
- **Sources:** LLD §4.10 "summary + monthly series + category breakdown".
- **Default:** the §2.10 summary metrics, plus:
  - `monthly`: in, out and net per IST month
  - `categoryBreakdown`: every IN and OUT category with total and number of entries, zeros included
  `from`/`to` filter like the summary.

### OQ-66 — Low-stock email content — ACCEPTED (until Group 1 merges)
- **Default:** product name, size, available, threshold and an inventory link. There is no club name, because no Group 1 club lookup exists yet.

### OQ-67 — PricingPolicy test double — OPEN (disclosure)
- **Consequence (recorded at the Step 4 checkpoint):** every order and quote test runs on this stand-in, so **the merchandise pricing rules (member discount, offers, BEST_OF/STACK) are unverified** until TC-MER-05 and the order flow run against Group 1's real PricingPolicy (Step 5 prerequisite).
- **Default:** in tests only, `tests/helpers/group1Fakes.js` provides a LIST-price stand-in with the members-only gate, so order flows can run. It is not PricingPolicy. The runtime `pricing.quoteMerchItem` is a `TODO(group1)` stub, and TC-MER-05 stays skipped (OQ-07). Discounted-price paths are tested by overriding the stand-in per test.

## OD/ASM defaults affecting Group 2

| ID | Default used | Isolation point |
|---|---|---|
| OD-01 | `BEST_OF` | `PRICING_COMBINATION_MODE` env → injected into G1 `PricingPolicy` |
| OD-06 | CH approves/pays the treasurer's claims; direct expense by TR needs a receipt only | `finance/expenses/domain/approvalPolicy.js` (single module) |
| OD-08 | No refunds; refunds = 0; no cancellation after `CONFIRMED` | `finance/domain/formulas.js`; order state machine |
| OD-09 | No opening balance | not implemented |
| ASM-11 | Variants share the product price | schema |
| ASM-12 | TEAM reads aggregate summary; TR/CH read details | `authorize` declarations on finance routes |
| ASM-13 | 15-minute hold | `RESERVATION_HOLD_MINUTES` |
| LLD §2.9 tolerance | `FUNDRAISER_AT_RISK_TOLERANCE_PCT=20` (LLD says it needs team validation) | env |
