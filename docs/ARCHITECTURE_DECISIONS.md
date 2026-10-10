# Architecture Decisions and Unresolved Decisions — Student Organization Management System

| Field | Value |
|---|---|
| Document | `docs/ARCHITECTURE_DECISIONS.md` |
| Status | **DRAFT — pending independent OpenAI Codex review. Not approved.** |

Contents: **§A** Architecture Decision Records · **§B** Assumptions and open decisions (need team approval) · **§C** Codex review checklist · **§D** Design patterns evaluation · **§E** SOLID and maintainability checklist · **§F** Cross-document consistency audit.

ADR status values: `Proposed` (all ADRs, until Codex review and team sign-off).

---

## A. Architecture Decision Records

### ADR-001 — Modular monolith
- **Context**: Hackathon team, one deployment, cross-module atomic operations (payment ⇒ ticket ⇒ ledger).
- **Decision**: One Express app with modules owning tables and exposing `index.js` service APIs; one React SPA; one PostgreSQL.
- **Alternatives**: Microservices (rejected: distributed transactions/sagas, more containers, no scaling requirement); unstructured monolith (rejected: rules scatter, hard to review).
- **Consequences**: + single-DB transactions, simple Compose; − discipline needed to keep boundaries (enforced by dependency-cruiser); extraction later is possible along module APIs.

### ADR-002 — JavaScript (ES modules) on both tiers
- **Decision**: No TypeScript (prompt default). zod schemas give runtime types at the API boundary; JSDoc on public module APIs.
- **Alternative**: TypeScript (would need explicit approval).
- **Consequences**: Faster start; type safety relies on zod + tests.

### ADR-003 — Knex for migrations and queries, no ORM
- **Decision**: Knex migrations and query builder with bindings; raw SQL only through bindings for conditional updates/reports.
- **Alternatives**: Sequelize/Prisma (ORM abstractions obscure conditional updates and locking; Prisma pushes toward TS), plain `pg` + node-pg-migrate (viable; Knex chosen for one tool for both).
- **Consequences**: Explicit SQL for concurrency-critical paths; repositories hold all SQL.

### ADR-004 — Server-side sessions with CSRF mitigation
- **Decision**: `express-session` + `connect-pg-simple`, httpOnly `SameSite=Lax` cookie, required `X-Requested-With` header on mutating requests.
- **Alternatives**: JWT in localStorage (XSS exposure, no revocation), JWT access + refresh cookies (more moving parts).
- **Consequences**: Revocable sessions, no extra infra; requires same-site deployment (nginx proxy in prod profile).

### ADR-005 — Backend-authoritative pricing and eligibility
- **Decision**: `PricingPolicy` on the server computes every price; clients only send `expectedFinalPricePaise`/`expectedTotalPaise`/`expectedFeePaise` for change detection; mismatch ⇒ `409 PRICE_CHANGED`.
- **Alternatives**: Trust client price (rejected by requirement); no expected price (user could be charged a changed price silently).
- **Consequences**: Prices consistent and auditable (snapshot in bookings/order items); one extra round-trip when prices change.

### ADR-006 — Atomic one-time ticket check-in
- **Decision**: Single conditional `UPDATE tickets … WHERE status='VALID' AND event_id=… RETURNING`, plus `UNIQUE(check_ins.ticket_id)` and a CHECK tying `USED` to `used_at/used_by`. Membership QR verification is a separate read-only endpoint with a different payload prefix.
- **Alternatives**: SELECT-then-UPDATE (race), `SERIALIZABLE` isolation (retries needed), advisory locks (unnecessary).
- **Consequences**: Exactly one success under concurrency without retries; rejected scans resolved by a follow-up read.

### ADR-007 — Capacity and inventory via counters, conditional updates, constraints and holds
- **Decision**: `events.seats_reserved`/`early_bird_reserved` and `product_variants.stock_on_hand`/`stock_reserved` changed only by conditional updates; CHECK constraints as backstop; unpaid reservations expire after `RESERVATION_HOLD_MINUTES`; stock decremented on payment success.
- **Alternatives**: `SELECT … FOR UPDATE` then compute (works but longer locks); counting rows each time (race-prone); decrement at order placement (abandoned carts lose stock permanently).
- **Consequences**: No overselling; held seats temporarily unavailable; requires reservation-expiry job.

### ADR-008 — Money as BIGINT paise
- **Decision**: All amounts `BIGINT` paise, `currency='INR'`, discounts in basis points, half-up rounding once per line.
- **Alternative**: `NUMERIC(12,2)` (correct but JS handles it as strings; easier to mix rupees and paise).
- **Consequences**: Integer arithmetic in JS (values far below 2^53); UI converts rupees↔paise in one utility.

### ADR-009 — Plan snapshot per membership term
- **Decision**: Each `membership_terms` row stores the plan's fee, duration and benefits at purchase; benefits applied at booking/ordering come from the covering term.
- **Alternative**: `membership_plan_versions` table (more joins, no added requirement).
- **Consequences**: Plan edits never change existing members; history self-describing.

### ADR-010 — Simulated payment engine with handler registry
- **Decision**: `payments` table with `is_simulated` forced true; outcomes set by the user on a labelled checkout screen or by the AutoPay simulator; `settle()` conditional; purpose handlers registered at composition root.
- **Alternatives**: Real gateway sandbox (out of scope, requires provider); direct status flags on bookings/orders (duplicated logic per module).
- **Consequences**: Uniform payment history and idempotency; a real gateway later replaces only the outcome source (webhook → `settle`).

### ADR-011 — College verification adapter
- **Decision**: `CollegeVerificationAdapter.verify({studentIdentifier, fullName})`; `Mock` (fixtures) and `Unconfigured` (always UNAVAILABLE) implementations; identifier stored only as HMAC.
- **Alternatives**: Import a student list CSV (not specified), manual approval by club head (not specified).
- **Consequences**: Testable now; production integration blocked on the college's contract (R-01). Input fields to be confirmed (OD-02).

### ADR-012 — Frontend production build served by nginx stage
- **Decision**: Frontend container has a dev stage (Vite) and a prod stage (static build + nginx proxying `/api` to backend), giving same-origin cookies.
- **Alternative**: Express serves static files (couples deploys; acceptable fallback).
- **Consequences**: nginx is an implementation detail of the frontend image, not a separate mandatory service.

### ADR-013 — In-process scheduler
- **Decision**: `node-cron` in the backend; each run guarded by `pg_try_advisory_lock` and `job_runs(job_name, run_key)` uniqueness; jobs idempotent by data constraints.
- **Alternatives**: Separate worker container, pg-boss, external cron (extra infra not required for a single deployment).
- **Consequences**: Jobs stop when backend stops (risk R-04); safe if a second instance is ever started.

### ADR-014 — Transactional outbox for notifications
- **Decision**: Deliveries inserted in the business transaction; dispatcher sends later with retries; dev adapters.
- **Alternative**: Send inline in request (slow, failure couples to business operation).
- **Consequences**: Business operations never fail due to email/WhatsApp; delivery status visible.

### ADR-015 — Settled-only, append-only ledger
- **Decision**: `financial_transactions` contains only money actually received (SUCCEEDED payments, recorded fundraiser income) or paid out (PAID expenses); pending states live in `payments`/`expenses`; UPDATE/DELETE blocked by trigger; one row per source.
- **Alternative**: Ledger rows with mutable status (harder to audit, easy to double count).
- **Consequences**: Simple, correct formulas; corrections/refunds would need reversal entries (not in scope, OD-08).

### ADR-016 — Local-volume receipt storage
- **Decision**: `FileStorage` interface, `LocalFileStorage` on a Docker volume; metadata in `uploaded_files`.
- **Alternatives**: `bytea` in PostgreSQL (bloats DB/backups), S3-compatible service (unapproved external service).
- **Consequences**: Backup must include the volume; swapping to object storage later only changes the implementation.

---

## B. Assumptions and Open Decisions

**Assumptions** (ASM) are defaults the design relies on where sources are silent; they should be confirmed but do not block. **Open decisions** (OD) change business behaviour and **require explicit team approval** (task T-01) before the related code is finalised.

| ID | Statement | Why | Default in docs | Approval |
|---|---|---|---|---|
| ASM-01 | Clubs and first club heads created by seed/CLI; no platform admin | No source defines who creates clubs; adding an admin role would be a new business role | CLI `create-club`, `assign-club-head` | Confirm |
| ASM-02 | College DB contract unknown | Prompt forbids inventing it | Adapter + mock + unconfigured stub | Confirm |
| ASM-03 | Plans only for verified college students | Prompt: "college-student membership plans" | Unverified cannot list/buy plans | Confirm |
| ASM-04 | One ticket per booking, one live ticket per user per event | Member price is personal; guest tickets not specified | Partial unique index | Confirm (see OD-07) |
| ASM-05 | Null non-member price ⇒ members-only event | "according to eligibility" | `MEMBERS_ONLY_EVENT` | Confirm |
| ASM-06 | Ticket stays valid if membership expires before the event | Price locked at purchase | Door validates ticket only | Confirm |
| ASM-07 | Organizers edit description/venue, manage staff, monitor; no pricing/capacity/publish/cancel | Club head is the authority for creation; organizer limited to "operations needed" | LLD §2.5 | Confirm |
| ASM-08 | Membership validity as inclusive IST date | Simple, timezone-safe reminders | `expires_on date` | Confirm |
| ASM-09 | Missed reminder day ⇒ single catch-up reminder | Prompt: no extra schedules; still exactly one reminder | LLD §5.3 | Confirm |
| ASM-10 | Plan duration in months | PDF "end of the year" approximated by 12-month plan | `duration_months` | See OD-05 |
| ASM-11 | Size variants share product price | Not specified | price on product | Confirm |
| ASM-12 | Team members read aggregate finance summary; details for treasurer/club head | PDF: "anyone on the team can understand it" vs. prompt "according to defined permissions" | HLD §2.3 | Confirm |
| ASM-13 | 15-minute reservation hold | Needed to prevent abandoned holds | env | Confirm |
| ASM-14 | Event communications = event-linked announcements (members + ticket holders) + booking confirmation email | Prompt: "receive event-related communications" | LLD §2.7 | Confirm |
| OD-01 | Stacking member discount with early-bird/offer prices; member plan discount applies on top of the event member price | Not specified; prompt requires flagging | `BEST_OF` (single best price; plan discount applied to member regular price) | **Required** |
| OD-02 | College verification inputs and re-verification | Contract unknown | Student ID + full name; no periodic re-verification | **Required** (with college) |
| OD-03 | Meaning of "early-bird access to eligible events" | Two readings: early booking window vs. early-bird price eligibility | Early booking window from `early_access_opens_at`; early-bird prices separate for all eligible buyers | **Required** |
| OD-04 | AutoPay attempt timing | Not specified | On expiry date, 06:00 IST, single attempt | **Required** |
| OD-05 | Rolling duration vs fixed academic-year end | PDF says memberships run out at end of year | Rolling months | **Required** |
| OD-06 | Approver for treasurer's own claims; second approval for direct expenses | Separation of duties not specified | Club head approves treasurer's claims; direct expense by treasurer needs receipt only | **Required** |
| OD-07 | Guest / multiple tickets per user | Not specified | Not supported | **Required** |
| OD-08 | Refunds after cancellation | No refund workflow specified | Not supported; offline settlement; report refunds = 0 | **Required** |
| OD-09 | Opening balance from the existing notebook | PDF context: budget currently in a notebook | Not supported unless approved | **Required** |

Unresolved external dependencies: college database contract (R-01), email provider, WhatsApp provider (R-02). None is invented in these documents.

---

## C. Codex Review Checklist

**OpenAI Codex must independently review all five documents (`HLD.md`, `LLD.md`, `IMPLEMENTATION_PLAN.md`, `REQUIREMENT_TRACEABILITY.md`, `ARCHITECTURE_DECISIONS.md`) before implementation begins. The documents must not be described as approved until that review has taken place and its corrections are applied.** Codex should flag, with a recommended correction for each:

1. **Completeness**: any PDF scene or prompt requirement missing from the traceability matrix, or mapped to an endpoint/table/test that does not exist in the LLD.
2. **Invented scope**: any feature, role, channel, provider, API contract or college-DB detail not supported by the sources (check §2.4 exclusions and every ASM/OD).
3. **Architecture**: module boundaries identical in HLD §6 and LLD §1; no circular dependency (payment handler registry); reporting is the only cross-table reader.
4. **Patterns & SOLID**: abstractions in §D each justified; no unnecessary layers; controllers thin; no business logic in React.
5. **Database**: every entity in LLD §2 has a table; FKs, composite club FKs, partial unique indexes, CHECKs and triggers are correct and implementable in PostgreSQL 16; migration order resolves all FKs (notably `renewal_attempts.payment_id`, `stock_movements.order_id`).
6. **Transactions & concurrency**: bookings/early-bird counters, check-in, stock reservation & decrement order (deadlock avoidance), settlement idempotency, AutoPay unique attempt, outbox claims (`SKIP LOCKED`).
7. **API & authorization**: every frontend route has its endpoints; every endpoint has role + scope; no endpoint can set protected fields; 403 vs 404 policy consistent.
8. **Membership workflows**: verification gating, activation only on success, term date maths (renewal before/after expiry), reminder query exactly-once, AutoPay guards (price change, archived plan), pending timeout.
9. **Financial consistency**: formulas in LLD §2.10 vs reporting SQL §5.15; pending/failed excluded from revenue; projected balance labelling; reconciliation checks; ledger immutability; separation of duties.
10. **Pricing**: PricingPolicy cases (member/non-member, expired, early access, early-bird quantity race, BEST_OF vs STACK, rounding) and `PRICE_CHANGED` handling.
11. **Notifications & jobs**: retry schedule, NOT_CONFIGURED handling, dedupe keys, advisory locks, dev tooling disabled in production.
12. **Security**: session/CSRF approach, upload validation, QR payload opacity, log redaction, rate limits, secrets.
13. **Docker & reproducibility**: Compose health checks, migration on start, volumes for DB and uploads, prod profile differences.
14. **Tests & plan**: every TC-* maps to an invariant; concurrency tests realistic (separate connections); task dependencies match the Mermaid graph; P0/P1 classification does not demote required features.
15. **Open decisions**: each OD clearly marked and its default isolated (config flag or single module) so a different decision is cheap.

---

## D. Design Patterns Evaluation

| Pattern | Adopted? | Problem it solves | Where | Trade-offs |
|---|---|---|---|---|
| Layered architecture (controller → service → repository) | Yes | Keeps HTTP, business rules and SQL separate and testable | Every backend module | Some boilerplate per module |
| Repository | Yes (thin, per aggregate) | Centralises SQL incl. conditional updates; avoids duplicated queries | `*/repository.js` | Not a generic repository — explicit methods only (e.g. `reserveSeat`) |
| Service layer | Yes | One place per use case for transactions, authz scope, audit, outbox | `*/service.js` | Must stay small; split by sub-domain when a file grows (e.g. bookings vs check-ins) |
| Dependency injection (manual, composition root) | Yes | Swap adapters, clock, pricing mode in tests/config | `container.js` passes dependencies into service factories | No DI framework; plain function factories |
| Adapter | Yes | Unknown external systems behind stable interfaces | College verification, Email, WhatsApp, FileStorage | Interfaces kept minimal (one method each) |
| Strategy | Yes (one place) | Two documented pricing combination modes pending OD-01 | `PricingPolicy` with `BEST_OF`/`STACK` | Only justified because the rule is undecided; collapse to one if OD-01 picks one permanently |
| Explicit state machines (transition tables) | Yes | Unambiguous lifecycles, guarded transitions | membership, term, payment, event, booking, ticket, order, expense, task, fundraiser, delivery | Transitions also enforced by conditional SQL (`WHERE status=…`) — table + SQL must agree (tested) |
| Registry (payment purpose handlers) | Yes | Breaks payments ↔ domain cycle | `finance/payments/handlerRegistry.js` | Indirection; documented in container |
| Transactional outbox | Yes | Reliable notifications decoupled from request | notifications | Delivery is asynchronous (≤ 1 min delay) |
| Transaction Script / Unit of Work | Transaction script per use case with `withTransaction(trx)` | Atomic multi-table writes | services | Explicit `trx` passing to repositories |
| Factory | No (except tiny `createAdapter(mode)` switch in container) | Object creation is trivial | — | — |
| ORM / Active Record | No | Concurrency-critical SQL must be explicit | — | More hand-written SQL |
| Inheritance hierarchies | No | Composition and interfaces suffice | — | — |
| Event bus / CQRS | No | No requirement; registry + outbox cover needs | — | — |

---

## E. SOLID and Maintainability Checklist

| Principle | How the design satisfies it | Evidence |
|---|---|---|
| Single Responsibility | Controllers map HTTP; services orchestrate one use case; repositories do SQL; domain files hold pure rules; ledger has one writer | LLD §1.1, §5 |
| Open/Closed | New notification channel/provider, verification backend or payment outcome source = new adapter registered in container; new payment purpose = new handler; no edits to core services | LLD §2.7, §2.10 |
| Liskov Substitution | All adapter implementations (Mock/Unconfigured/Dev/real) honour the same contract incl. error semantics (`UNAVAILABLE`, `NOT_CONFIGURED` non-retryable) — verified by shared contract tests | LLD §2.1, §2.7 |
| Interface Segregation | Each adapter interface has one method; modules expose small `index.js` APIs (e.g. `getActiveBenefits`) instead of repositories | HLD §6 |
| Dependency Inversion | Services depend on adapter interfaces and injected clock/pricing mode; payments depends on handler interface, not domains | HLD §6, ADR-010 |
| Testability & modularity | Pure domain functions; injectable clock; test DB; jobs callable directly | LLD §10 |
| Database integrity | FKs incl. composite club FKs, CHECKs, partial unique indexes, immutability triggers, conditional updates | LLD §3 |
| Consistent API contracts | One error envelope, pagination, idempotency, camelCase JSON, paise integers | HLD §8, LLD §4.0 |
| Security & least privilege | Default deny; scoped roles; organizers without finance approval; separation of duties for reimbursements; 404 for other clubs | HLD §2.3, §9 |
| Extensibility without scope expansion | Extension points exist (adapters, handlers, pricing mode) but no speculative features are built | HLD §2.4, §4 |

Why each major abstraction exists: `CollegeVerificationAdapter` — contract unknown; `EmailAdapter`/`WhatsAppAdapter` — providers unknown; `FileStorage` — keeps storage swappable without an unapproved service; `PricingPolicy` — single source of pricing for events and merchandise, undecided stacking; `PaymentPurposeHandler` — avoids circular dependency; `ledger.post` — single guarded writer for auditability; `runJob` — duplicate-run prevention in one place. No other interfaces are introduced.

---

## F. Cross-Document Consistency Audit (pre-review self-check)

| # | Check (prompt §16) | Result | Notes / fixes applied |
|---|---|---|---|
| 1 | HLD and LLD use same module boundaries | Pass | HLD §6 modules = LLD §1.1 `modules/*` (pricing and dev are helper modules, called out) |
| 2 | Every LLD entity exists in DB design | Pass | §2 entities ↔ §3.1 tables, incl. `renewal_attempts`, `autopay_consents`, `uploaded_files` |
| 3 | Endpoints use correct relationships & authz | Pass | Role column per endpoint in LLD §4; club scope resolved from resource |
| 4 | Every frontend action has a backend operation | Pass | LLD §6.1 routes ↔ §4 endpoints (pickup endpoint aligned to `/clubs/:clubId/pickups` in HLD §8) |
| 5 | Every job has trigger, lifecycle, failure handling | Pass | LLD §7 table |
| 6 | Financial reports use defined formulas & ledger | Pass | LLD §2.10, §5.15 |
| 7 | Pricing consistent | Pass | Only `PricingPolicy`; snapshot in bookings/order_items |
| 8 | Membership QR vs ticket redemption separate | Pass | Different payload prefixes and endpoints; TC-MEM-06 |
| 9 | No duplicate renewal transactions / no extension after failure | Pass | Unique attempt, partial unique pending term, conditional settle, extension only in `onSucceeded` |
| 10 | Inventory never negative | Pass | Conditional reserve + CHECK |
| 11 | Capacity never exceeded | Pass | Conditional increment + CHECK |
| 12 | Club isolation | Pass | `club_id` everywhere, composite FKs, 404 policy |
| 13 | All PDF features in matrix | Pass | PDF-01…PDF-23 |
| 14 | All prompt requirements in matrix | Pass | PR-* rows, NFRs, docs |
| 15 | No unapproved feature | Pass with flags | Items needing confirmation are ASM/OD rows (e.g. booking confirmation email ASM-14, low-stock email to club heads, membership QR rotation, reconciliation endpoint — all support stated requirements) |

Items Codex should look at with extra care because they are interpretations rather than literal requirements: ASM-12 (finance visibility), ASM-14 (booking confirmation email), membership QR rotation (security support for PR-MEM-12), low-stock emails (alert delivery for PR-MER-13), reconciliation endpoint (support for PR-FIN-12 "how it affected the summary").
