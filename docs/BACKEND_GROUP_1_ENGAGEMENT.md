# Backend Workstream — Group 1 (Engagement)

| Field | Value |
|---|---|
| Document | `docs/BACKEND_GROUP_1_ENGAGEMENT.md` |
| Pair doc | `docs/BACKEND_GROUP_2_PLATFORM_COMMERCE.md` |
| Sources of truth | `HLD.md`, `LLD.md`, `IMPLEMENTATION_PLAN.md`, `REQUIREMENT_TRACEABILITY.md` |
| HLD modules | M1 Auth & Profiles, M2 Clubs & Roles, M3/M4 Memberships, M5 Events & Ticketing, M6 Announcements (write path); shared `pricing` |

**Theme:** Identity, college verification, club roles, membership lifecycle, event ticketing and check-in, club announcements (publish + recipient snapshot). You **enqueue** notifications; Group 2 **dispatches** them.

---

## 1. Scope summary

| Area | In scope | Out of scope (Group 2) |
|---|---|---|
| Users, sessions, profile, college verification | ✔ | — |
| Clubs, club-scoped roles, authZ consumers | ✔ (middleware with Group 2 on `shared`) | Platform skeleton sole ownership |
| Membership plans, join/renew, AutoPay consent, digital ID + QR verify | ✔ | Payment engine, ledger writer |
| `PricingPolicy` (pure module) | ✔ **owner** | Merchandise order flow |
| Events, bookings, tickets, check-in | ✔ | — |
| Announcements (draft, publish, deliveries **records**) | ✔ | Email/WhatsApp adapters, dispatch job |
| Jobs | `membership-expiry`, `renewal-reminders`, `autopay-renewals`, booking side of `reservation-expiry` | `notification-dispatch`, job runner core |
| Reporting | Event report **inputs** (data your modules own); coordinate on `reporting` SQL with Group 2 | Finance/merch/membership aggregate reports |
| Migrations you own | 002, 003, 006, 007 | 001, 004, 005, 008–012 |

**Estimated backend effort (from plan):** ~115–125 focused hours after joint foundation.

---

## 2. Backend modules and folders

```
backend/src/modules/
├── auth/                 # users, sessions, profile, college verification
├── clubs/                # clubs, club_role_assignments, authz queries
├── memberships/          # plans, memberships, terms, autopay, digital id, payment handlers
├── pricing/              # PricingPolicy — used by events (you) and merchandise (Group 2)
├── events/               # events, organizers, staff, bookings, tickets, check-in, ticket handler
└── announcements/        # announcements CRUD, publish, snapshot recipients → notification_deliveries

backend/src/jobs/definitions/
├── membershipExpiry.js
├── renewalReminders.js
├── autopayRenewals.js
└── reservationExpiry.js   # booking / membership-term holds (coordinate stock half with Group 2)
```

Payment purpose handlers you implement (register in `container.js` **with Group 2 review**):

- `MEMBERSHIP_JOIN`, `MEMBERSHIP_RENEWAL` → `memberships/handlers/membershipPaymentHandler.js`
- `EVENT_TICKET` → `events/handlers/ticketPaymentHandler.js`

---

## 3. Task checklist (IMPLEMENTATION_PLAN IDs)

Complete in order within your track; joint tasks marked **pair**.

| Phase | Task ID | Description | Depends on Group 2 |
|---|---|---|---|
| **Pair** | T-10, T-11, T-14, T-15 | Repo, Docker, FE core, test harness | Shared with G2 |
| **Pair** | T-20–T-23 | Auth, clubs, `authorize()`, capabilities | G2: T-12, T-13 for DB/shared |
| **Pair** | T-24 | Idempotency + audit | G2 leads migrations 001/004 |
| G2 first | — | **Wait for T-32** (payments + `ledger.post`) before activation paths | **Blocker** for T-33, T-43 |
| G2 first | — | **Wait for T-50** stub (`notifications.enqueue`) before T-55, T-52 | **Blocker** for publish/reminders |
| 3 | T-30 | College verification adapter + API | — |
| 3 | T-31 | Membership plans CRUD | — |
| 3 | T-33 | Join → activate via payment handler | T-32 |
| 3 | T-34 | Renewal, history | T-33 |
| 3 | T-35 | Digital membership ID + QR verify | T-33 |
| 3 | T-36 | AutoPay consent | T-34 |
| 3 | T-37 | Club member list | T-33 |
| 4 | T-40 | **PricingPolicy** + unit tests (100% branch) | T-01 (OD-01 stacking mode) |
| 4 | T-41 | Event CRUD, lifecycle, organizers/staff | T-23 |
| 4 | T-42 | Public listing + price quote | T-40, T-41, T-33 |
| 4 | T-43 | Booking, reservation, ticket + handler | T-42, **T-32** |
| 4 | T-44 | Check-in (atomic) | T-43 |
| 4 | T-45 | Event bookings view | T-43 |
| 5 | T-52 | Expiry + 7-day reminder jobs | T-50, T-51, T-34 |
| 5 | T-53 | AutoPay renewal job | T-36, T-51, T-50 |
| 5 | T-54 | Reservation expiry (bookings + terms) | T-43, T-51 |
| 5 | T-55 | Announcements publish + snapshot | T-50, T-33, T-43 |
| 8 | T-84 | Event report (backend queries) | T-44; expense slice from G2 T-81 |

**Parallel work while blocked on T-32:** T-30, T-31, T-40 (pure), T-41, authZ tests, handler stubs that no-op until settle exists.

---

## 4. Database migrations (owner)

| Migration | Tables (principal) | Notes |
|---|---|---|
| 002 | `users`, `user_sessions`, `college_verifications` | After 001 |
| 003 | `clubs`, `club_role_assignments` | FK to users |
| 006 | `membership_plans`, `memberships`, `membership_terms`, `autopay_consents`, `renewal_attempts` | FK to clubs, users, plans |
| 007 | `events`, `event_organizers`, `event_staff`, `bookings`, `tickets`, `check_ins` | Capacity counters, partial uniques |

Do **not** edit merged migrations; add a new numbered migration instead. Cross-module FKs to `payments` / `financial_transactions` are added in Group 2’s migrations when those tables exist.

`announcements` and `notification_deliveries`: schema lives in migration **012** (Group 2 owns the file). You define announcement columns and publish rules in PRs; Group 2 applies 012.

---

## 5. Public service API you must expose (`index.js`)

Freeze signatures at **checkpoint CP-1** (stubs OK until CP-2). Consumers: events module (internal), announcements, Group 2 reporting.

| Module | Functions (examples) | Called by |
|---|---|---|
| `auth` | `getUser`, `isVerifiedStudent`, `verifyCollegeStudent` | memberships, events quotes |
| `clubs` | `listClubs`, `getRoles`, `hasClubRole` | authZ middleware, all club routes |
| `memberships` | `getEffectiveMembership`, `getActiveBenefits`, `listActiveMemberRecipients(clubId)` | events pricing, announcements |
| `events` | `quotePrice`, `listTicketHolders(eventId)` | bookings, announcements |
| `pricing` | `quoteTicket(...)`, `quoteLineItem(...)` | events, merchandise (G2) |
| `announcements` | publish use case enqueues via `notifications.enqueue` | — |

You **call** (do not reimplement):

- `payments.create`, `payments.settle` — Group 2
- `ledger.post` — only inside payment handlers / never directly for domain income
- `notifications.enqueue` — Group 2

---

## 6. API surface (LLD §4 — your routes)

| Prefix / resource | Owner module |
|---|---|
| `/auth/*`, `/me`, `/me/college-verification` | auth |
| `/clubs`, `/clubs/:clubId/roles` | clubs |
| `/clubs/:clubId/plans`, `/clubs/:clubId/memberships`, `/me/memberships/*` | memberships |
| `/membership-verifications` | memberships |
| `/events`, `/clubs/:clubId/events`, `/events/:eventId/*` (bookings, staff, check-ins, report request) | events |
| `/me/tickets` | events |
| `/announcements`, `/clubs/:clubId/announcements`, publish/deliveries | announcements |

Simulated payment **simulate** endpoint is Group 2 (`/payments/:id/simulate`).

---

## 7. Authorization responsibilities

Every route you add must declare role + scope per HLD §2.3 and LLD §4. You own expanding **TC-AZ-01** for your endpoints.

High-sensitivity capabilities you implement:

- Verified-student gating for plans (ASM-03)
- Member / early-access / early-bird pricing (with `PricingPolicy`, OD-01 mode from config)
- Event organizer limits (ASM-07)
- Check-in and membership QR verify (scanner roles)
- Members-only announcement visibility

Cross-club access → **404** (not 403).

---

## 8. Transaction boundaries you own

| Operation | Must be atomic (single `withTransaction`) |
|---|---|
| Book ticket | Reserve seat → booking row → payment INITIATED (or free path → ticket) |
| Settle success (your handlers) | Payment conditional update → activate/extend membership **or** issue ticket → ledger income via `ledger.post` → enqueue notifications → audit |
| Check-in | Ticket `VALID→USED` conditional → `check_ins` insert |
| Publish announcement | `DRAFT→PUBLISHED` → insert `notification_deliveries` rows |

Concurrency: TC-EVT-01 (bookings), TC-CHK-03 (check-in). Run with Group 2 in T-90.

---

## 9. Tests you own

| Test IDs | Topic |
|---|---|
| TC-AUTH-01 | Register/login |
| TC-VER-01..04 | College verification |
| TC-MEM-01..06 | Membership lifecycle, QR |
| TC-AP-01..05 | AutoPay job |
| TC-REM-01..04 | Reminders |
| TC-PRC-01..05 | PricingPolicy |
| TC-EVT-01..04 | Events, booking |
| TC-CHK-01..04 | Check-in |
| TC-ANN-01, 02, 04 | Announcements (03 dispatch = G2) |
| TC-RPT-01 | Event report metrics |

---

## 10. Git and review rules

- Branch prefix: `g1/T-nn-short-name`
- **Required reviewer from Group 2** for: changes to `shared/`, `container.js` (handler registration), any migration, LLD §4 contract changes
- **Required reviewer from Group 1** when Group 2 changes handlers or pricing consumers

---

## 11. Checkpoints (your demo script)

| Checkpoint | You demonstrate |
|---|---|
| **CP-1** | Auth, clubs, authZ; membership/event APIs stubbed; handler interfaces registered |
| **CP-2** | Verified student joins club (payment settle) **and** books event → ticket QR; ledger row exists (verify with G2) |
| **CP-3** | Announcements publish; reminders/AutoPay via dev job runner; event report |
| **CP-4** | Concurrency suite green for bookings + check-in |

---

## 12. Definition of done (module extras)

See `IMPLEMENTATION_PLAN.md` §5. Additionally:

| Module | Extra criteria |
|---|---|
| Memberships | Activation/extension only after `SUCCEEDED` payment; one reminder per channel per term |
| Events | Capacity never exceeded; one check-in success under parallel scans |
| Pricing | Single implementation; snapshots on booking rows |
| Announcements | Published record immutable; recipient snapshot includes members + event ticket holders (ASM-14) |

---

## 13. Risks and dependencies

| Risk | Mitigation |
|---|---|
| Blocked on T-32 / T-50 | Build CRUD and pure domain first; integrate in CP-2 week |
| OD-01 pricing stacking | Settle at T-01 before finalising TC-PRC-* |
| College DB unavailable (R-01) | Mock adapter only; do not block registration |
| Missed scheduler (R-04) | ASM-09 catch-up in reminder job; document AutoPay limitation |

**Slack / standup ask to Group 2:** “Payments settle + ledger post ready?” “Enqueue + 012 migration ready?”
