# Requirement Traceability Matrix — Student Organization Management System

| Field | Value |
|---|---|
| Document | `docs/REQUIREMENT_TRACEABILITY.md` |
| Status | **DRAFT — pending independent OpenAI Codex review. Not approved.** |

Sources: **PDF** = `Student_Organization_System.pdf`; **PR** = team prompt (section numbers in brackets). HLD/LLD columns cite section numbers of `HLD.md` / `LLD.md`. Tasks are from `IMPLEMENTATION_PLAN.md`; tests from LLD §10. **Status** for every row is currently `Designed` (no code exists yet); it is updated by task T-100.

Abbreviations for frequent API paths: `/m/*` = `/me/memberships/*`; `/e/:id` = `/events/:eventId`; `/c/:id` = `/clubs/:clubId`.

---

## 1. Requirements from the problem statement (PDF)

| ID | Source | Requirement | HLD | LLD | DB entities | API endpoints | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PDF-01 | PDF §1 | One unified platform for events, members and money | §1, §4 | §1 | all | all | App shell, club dashboard | T-10, T-86 | TC-E2E-01 | Designed |
| PDF-02 | PDF §3 "A new student joins" | Know who a new member is (sign-up) | §2.1 M1/M4 | §2.1, §2.4 | users, memberships | `POST /auth/register`, `POST /c/:id/memberships` | Register, Join flow | T-20, T-33 | TC-AUTH-01, TC-MEM-01 | Designed |
| PDF-03 | PDF §3 | Know whether dues are paid | §2.1 M4 | §2.4, §2.10 | membership_terms, payments | `GET /m/:id`, `GET /c/:id/memberships` | Membership detail, Members page | T-33, T-37 | TC-MEM-01/02 | Designed |
| PDF-04 | PDF §3 | Membership benefits: discounts on tickets and merchandise | §2.1 M3 | §2.3, §2.6 | membership_plans, membership_terms | `GET /c/:id/plans`, `GET /e/:id/price-quote` | Plans, quote card | T-31, T-40 | TC-PRC-01, TC-MER-05 | Designed |
| PDF-05 | PDF §3 | Memberships expire; remind to renew before lapse | §10 | §2.4, §5.3, §7 | memberships, notification_deliveries | jobs; `POST /m/:id/renewals` | Membership detail, renew | T-34, T-52 | TC-REM-01..04 | Designed |
| PDF-06 | PDF §3 | Easy check that a person is a member at events | §9 (QR) | §2.4, §4.3 | memberships (qr_token) | `GET /m/:id/digital-id`, `POST /membership-verifications` | Membership card, Verify tab | T-35 | TC-MEM-05/06 | Designed |
| PDF-07 | PDF §3 "spring gala" | Sell tickets online | §2.1 M5 | §2.5, §5.7 | events, bookings, tickets, payments | `POST /e/:id/bookings` | Event detail, checkout | T-41–T-43 | TC-EVT-01 | Designed |
| PDF-08 | PDF §3 | Different prices for members and non-members | §2.1 | §2.6 | events, bookings | `GET /e/:id/price-quote` | Quote card | T-40, T-42 | TC-PRC-01/04 | Designed |
| PDF-09 | PDF §3 | Limit on seats; seats left | §7.3 | §3.2, §5.7 | events.capacity/seats_reserved | `GET /events`, `/e/:id` | Event detail | T-41, T-43 | TC-EVT-01 | Designed |
| PDF-10 | PDF §3 | Door check-in in seconds without printed list | §9, ADR-006 | §5.8, §6 | tickets, check_ins | `POST /e/:id/check-ins` | Scan page | T-44 | TC-CHK-01..04 | Designed |
| PDF-11 | PDF §3 | How many people actually showed up | §8 reports | §5.15 | check_ins | `GET /e/:id/report` | Event report | T-84 | TC-RPT-01 | Designed |
| PDF-12 | PDF §3 | How much the event made | §8 reports | §5.15 | financial_transactions | `GET /e/:id/report` | Event report | T-84 | TC-RPT-01 | Designed |
| PDF-13 | PDF §3 "Announcing" | Tell every member about meeting, deadline, change of plan | §10 | §2.7, §5.14 | announcements, notification_deliveries | `POST /announcements/:id/publish` | Announcements manage | T-55 | TC-ANN-01 | Designed |
| PDF-14 | PDF §3 | Website + mailing list; record of what was said and when | §10 | §2.7 | announcements (immutable) | `GET /announcements`, `/c/:id/announcements` | Feeds | T-55 | TC-ANN-02 | Designed |
| PDF-15 | PDF §3 "hoodies" | Sell branded hoodies/T-shirts; collect sizes, orders, payment | §2.1 M7 | §2.8, §5.9 | products, product_variants, orders, order_items, payments | `POST /c/:id/orders` | Shop, cart, checkout | T-60, T-62 | TC-MER-03 | Designed |
| PDF-16 | PDF §3 | Know how many of each size are left | §7.3 | §2.8 | product_variants | `GET /c/:id/inventory` | Inventory page | T-61 | TC-MER-01 | Designed |
| PDF-17 | PDF §3 | Order from phones at any hour | §12 NFR-11 | §6.3 | — | all merchandise endpoints | Responsive shop | T-62, T-95 | TC-E2E-01 (mobile viewport) | Designed |
| PDF-18 | PDF §3 "fundraiser" | Split tasks: who bakes, buys, manages table | §2.1 M8 | §2.9 | fundraisers, fundraiser_tasks | `POST /fundraisers/:id/tasks` | Task board | T-70 | TC-FUN-02 | Designed |
| PDF-19 | PDF §3 | See what remains, who does it, whether on track | §2.1 M8 | §2.9 | fundraiser_tasks | `GET /fundraisers/:id/overview` | Overview | T-71 | TC-FUN-01 | Designed |
| PDF-20 | PDF §3 "treasurer" | Explain dues, tickets, merchandise, reimbursed expenses | §7, ADR-015 | §2.10 | financial_transactions | `GET /c/:id/transactions`, `/finance/summary` | Finance dashboard | T-81, T-83 | TC-FIN-03 | Designed |
| PDF-21 | PDF §3 | One place: in, out, left; understandable at a glance by team | §2.3 (ASM-12) | §2.10 formulas | financial_transactions, expenses | `GET /c/:id/finance/summary` | Finance summary cards | T-83, T-86 | TC-FIN-03 | Designed |
| PDF-22 | PDF §2, §3 | Volunteer expense reimbursement with receipts (no chasing) | §2.1 M9 | §2.10, §5.11, §8 | expenses, uploaded_files | `POST /c/:id/expenses`, approve/reject/mark-paid | My expenses, review queue | T-80, T-81 | TC-FIN-01/02/06 | Designed |
| PDF-23 | PDF §2 | Budget raised from dues, tickets and fundraisers | §2.1 M9 | §2.10 | financial_transactions (FUNDRAISER_INCOME), budgets | `POST /c/:id/income-entries`, `/budgets` | Income form, budgets | T-82 | TC-FIN-03 | Designed |

## 2. Requirements from the prompt (PR)

### 2.1 Roles and access (PR §4)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-ROLE-01 | PR §4.1 | Student/member capabilities (browse, join, plans, status, digital ID, events as member/non-member, tickets & QR, merchandise, orders, announcements, renewal & event communications) | §2.3 | §2.2–2.8, §6.1 | users, memberships, tickets, orders | `/me/*`, `/events`, `/announcements` | Member pages | T-20–T-63 | TC-E2E-01 | Designed |
| PR-ROLE-02 | PR §4.2 | Non-college users register as ordinary users, browse, book as non-members, buy merchandise where offered, see own bookings/orders/payments, public announcements; no plans/benefits unless verified; verification unavailability never blocks registration/discovery | §2.3, ASM-03 | §2.1, §2.6 | users, college_verifications | `/auth/register`, `/events`, `/me/payments` | Public pages | T-20, T-30, T-42 | TC-VER-03/05, TC-EVT-03 | Designed |
| PR-ROLE-03 | PR §4.3 | Club head: plans, verification review, events, pricing, organizer assignment, announcements, merchandise, volunteers, fundraisers, finance access per permissions; sole authority for event creation & organizer assignment | §2.3 | §2.2, §2.5, §4 | club_role_assignments | `/c/:id/*` manage endpoints | `/manage/*` | T-22, T-31, T-37, T-41 | TC-EVT-04, TC-AZ-01 | Designed |
| PR-ROLE-04 | PR §4.4 | Organizer: assigned event only, monitor registrations/sales/capacity/attendance, coordinate staff, event reports; no org-wide/financial approval | §2.3, ASM-07 | §2.5 | event_organizers | `/e/:id/{bookings,staff,report,check-ins}` | Event management | T-41, T-45, T-84 | TC-AZ-01 | Designed |
| PR-ROLE-05 | PR §4.5 | Volunteer: tasks & deadlines, update progress, fundraiser activities, scan tickets when authorised, submit reimbursements | §2.3 | §2.5, §2.9, §2.10 | event_staff, fundraiser_tasks, expenses | `/me/tasks`, `/tasks/:id`, check-ins, expenses | My tasks, Scan, My expenses | T-44, T-70, T-81 | TC-FUN-02, TC-CHK-04 | Designed |
| PR-ROLE-06 | PR §4.6 | Treasurer: review transactions, track income, record expenses, review/approve/reject reimbursements, budgets, balances, history, reports | §2.3 | §2.10 | expenses, budgets, financial_transactions | finance endpoints | Finance pages | T-81–T-83 | TC-FIN-01..03 | Designed |
| PR-ROLE-07 | PR §4 | Permission definition for every role; isolation of other clubs' data and other users' records; multi-role users; role assignment & permission check mechanism; no extra business roles | §2.3, §9 | §2.2, §4.0 | club_role_assignments, event_organizers, event_staff | `/c/:id/roles`, `/auth/me` | RequireCapability, NavBar | T-22, T-23, T-91 | TC-AZ-01 | Designed |

### 2.2 Authentication & profile

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-AUTH-01 | PR §4 | Single authentication system: register and sign in | §9 | §4.1 | users, user_sessions | `/auth/*` | Login, Register | T-20 | TC-AUTH-01 | Designed |
| PR-AUTH-02 | PR §4.1 | Maintain profile | §2.1 | §2.1, §4.1 | users | `PATCH /me` | Profile | T-21 | API tests | Designed |

### 2.3 Membership (PR §5)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-MEM-01 | §5.1 | Discover clubs and initiate membership registration | §2.1 | §4.2, §4.3 | clubs, memberships | `GET /clubs`, `POST /c/:id/memberships` | Club page Join | T-22, T-33 | TC-MEM-01 | Designed |
| PR-MEM-02 | §5.1 | Verify against college DB via adapter; dev mock for verified/unverified; no invented contract | §3, §9, ASM-02 | §2.1 | college_verifications | `POST /me/college-verification` | Profile verification | T-30 | TC-VER-01..04 | Designed |
| PR-MEM-03 | §5.1 | Do not expose plans to unverified users | ASM-03 | §4.3 | — | `GET /c/:id/plans` | Club page | T-31 | TC-VER-02 | Designed |
| PR-MEM-04 | §5.1 | Registration records club, user, plan, fee, payment status, membership status | §7 | §3.1 memberships/terms/payments | memberships, membership_terms, payments | `POST /c/:id/memberships` | Join flow | T-33 | TC-MEM-01 | Designed |
| PR-MEM-05 | §5.2 | Multiple plans with fees, event discounts, early-bird access, merchandise discounts, duration/expiry; benefit representation & eligibility determination | §2.1 M3 | §2.3, §2.6 | membership_plans, membership_terms | plans CRUD | Plans page | T-31, T-40 | TC-PRC-01/05 | Designed |
| PR-MEM-06 | §5.2 | Backend is source of truth for prices, discounts, eligibility, status; frontend prices not trusted | ADR-005 | §2.6 | — | `expected*Paise` fields | — | T-40 | TC-PRC-06 | Designed |
| PR-MEM-07 | §5.3 | Activation after verification + payment; start/expiry dates; active/expired/pending/other states | §7 | §2.4 | memberships, membership_terms | payments simulate | Membership detail | T-33, T-52 | TC-MEM-01/02 | Designed |
| PR-MEM-08 | §5.3 | Renewal options, payment-status tracking, renewal & payment history | §2.1 | §2.4, §4.3 | membership_terms, payments | `GET /m/:id`, `POST /m/:id/renewals` | Membership detail | T-34 | TC-MEM-03 | Designed |
| PR-MEM-09 | §5.3 | Automated renewal reminders 7 days before expiry by email and WhatsApp; no other schedules | §10 | §5.3, §7 | notification_deliveries | job | — | T-52 | TC-REM-01..04 | Designed |
| PR-MEM-10 | §5.3 | Handle failed, pending, successful payments | §7.2 | §2.10 payment states | payments | `POST /payments/:id/simulate` | Checkout | T-32 | TC-PAY-01, TC-MEM-02 | Designed |
| PR-MEM-11 | §5.4 | Simulated AutoPay: consent, eligibility, trigger, extension on success, failed/pending handling, duplicate prevention, notification, recording; no real providers; never extend on mere initiation | §10, ADR-010 | §2.4, §5.4 | autopay_consents, renewal_attempts, payments | `PUT /m/:id/autopay`, job | AutoPay toggle | T-36, T-53 | TC-AP-01..05 | Designed |
| PR-MEM-12 | §5.5 | Digital membership ID with QR in profile; authorised verification of status | §9 | §2.4, §4.3 | memberships.qr_token | digital-id, membership-verifications | Card page, Verify tab | T-35 | TC-MEM-05 | Designed |
| PR-MEM-13 | §5.5 | Membership QR distinct from ticket; not invalidated by scanning | ADR-006 | §2.4, §5.8 | — | — | Verify tab | T-35 | TC-MEM-05/06 | Designed |
| PR-MEM-14 | §4.1 | View status, benefits, expiry, payment history, renewal options | §2.1 | §4.3 | — | `GET /m/:id` | Membership detail | T-34, T-85 | API tests | Designed |

### 2.4 Events and ticketing (PR §6)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-EVT-01 | §6.1 | Event fields: club, title, description, date/time/details, registration open/close, capacity, member/non-member prices, early-bird, availability/sales status, organizer | §2.1 | §2.5, §3.1 events | events | `POST /c/:id/events` | Event form | T-41 | validation tests | Designed |
| PR-EVT-02 | §6.1 | Club head creates events and assigns organizer | §2.3 | §2.5, §5.5 | event_organizers | `PUT /e/:id/organizers` | Organizer picker | T-41 | TC-EVT-04 | Designed |
| PR-EVT-03 | §6.1 | Event and ticket lifecycle states | §7 | §2.5 | events, bookings, tickets | publish/cancel/complete | Event management | T-41, T-43 | state tests | Designed |
| PR-EVT-04 | §6.2 | Members receive active-plan benefits; non-members pay non-member price | §2.1 | §2.6 | membership_terms | quote | Quote card | T-40, T-42 | TC-PRC-01 | Designed |
| PR-EVT-05 | §6.2 | Early-bird only in configured period and subject to availability | §2.5 OD-03 | §2.6 | events.early_bird_* | quote, bookings | Quote card | T-40, T-43 | TC-PRC-02 | Designed |
| PR-EVT-06 | §6.2 | No sales beyond capacity, incl. concurrent bookings | §7.3, ADR-007 | §3.2, §5.7 | events.seats_reserved | bookings | — | T-43, T-54, T-90 | TC-EVT-01/02 | Designed |
| PR-EVT-07 | §6.2 | Expired-membership treatment at booking and at event | ASM-06 | §2.5 | — | — | — | T-42 | TC-PRC-04 | Designed |
| PR-EVT-08 | §6.2 | Pricing precedence documented; stacking flagged as assumption requiring approval | OD-01 | §2.6 | bookings.pricing_mode | — | — | T-01, T-40 | TC-PRC-03 | Designed |
| PR-EVT-09 | §6.3 | Unique ticket record with booking relationship | §7 | §3.1 tickets | tickets, bookings | — | — | T-43 | TC-EVT-01 | Designed |
| PR-EVT-10 | §6.3 | Unique QR per ticket; no sensitive data in QR | §9 | §5.7 | tickets.qr_token | `GET /me/tickets/:id` | Ticket page | T-43 | QR payload test | Designed |
| PR-EVT-11 | §6.3 | Ticket shown in profile/booking history with payment & ticket status | §2.1 | §4.5 | tickets, payments | `GET /me/tickets` | My tickets | T-43 | API tests | Designed |
| PR-EVT-12 | §6.4 | Validate existence, event, payment & ticket status; reject cancelled/invalid/used | ADR-006 | §5.8 | tickets, bookings | check-ins | Scan page | T-44 | TC-CHK-01..04 | Designed |
| PR-EVT-13 | §6.4 | Record check-in timestamp and staff member; "Already used" on re-scan | §7.3 | §5.8 | check_ins | check-ins | Scan result panel | T-44 | TC-CHK-02 | Designed |
| PR-EVT-14 | §6.4 | Safe simultaneous scans (transactions, conditional update, constraints) | ADR-006 | §3.2, §5.8 | check_ins unique | — | — | T-44, T-90 | TC-CHK-03 | Designed |
| PR-EVT-15 | §6.5 | Event report: sold, capacity, member vs non-member, early-bird, revenue & payment status, attendance, rate, expenses, financial summary, graphs; formulas & queries | §8 | §5.15 | — | `GET /e/:id/report` | Event report | T-84 | TC-RPT-01 | Designed |
| PR-EVT-16 | §6.5 | Pending/failed payments never counted as revenue; gross/refunds/net/expenses distinguished | ADR-015 | §5.15 | financial_transactions | report | — | T-84 | TC-FIN-03 | Designed |
| PR-EVT-17 | §4.1/§4.2 | Register for events as member or non-member per eligibility & availability | ASM-05 | §2.6 | events.non_member_price_paise | quote, bookings | Event detail | T-42 | TC-EVT-03 | Designed |

### 2.5 Announcements (PR §7)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-ANN-01 | §7 | Create and publish announcements | §10 | §2.7 | announcements | create/publish | Manage announcements | T-55 | TC-ANN-01 | Designed |
| PR-ANN-02 | §7 | Categories: meetings, deadlines, events, schedule changes | — | §2.7 | announcements.category | create | Form | T-55 | validation | Designed |
| PR-ANN-03 | §7 | Associate with club | §6 | §3.1 | announcements.club_id | `/c/:id/announcements` | — | T-55 | TC-AZ-01 | Designed |
| PR-ANN-04 | §7 | Record of what, who, when | §7.3 | §2.7 | published_by/at, immutability trigger | — | Feed | T-55 | TC-ANN-02 | Designed |
| PR-ANN-05 | §7 | Mailing/recipient list for eligible members | §10 | §5.14 | notification_deliveries | publish | Delivery report | T-55 | TC-ANN-01 | Designed |
| PR-ANN-06 | §7 | Email delivery via configurable notification interface | §10 | §2.7 | notification_deliveries | — | — | T-50 | TC-ANN-03 | Designed |
| PR-ANN-07 | §7 | WhatsApp for the required renewal reminders only | §10 | §2.7, §5.3 | notification_deliveries.channel | — | — | T-50, T-52 | TC-REM-01/03 | Designed |
| PR-ANN-08 | §7 | Delivery status, failure handling, dev mode without credentials; no provider assumed | §10 | §2.7, §7 | notification_deliveries | `/announcements/:id/deliveries`, `/dev/outbox` | Delivery report, Dev outbox | T-50 | TC-ANN-03 | Designed |
| PR-ANN-09 | §4.1/§4.2 | Members view announcements; non-members view public ones | §2.3 | §2.7 | announcements.audience | `GET /announcements` | Feeds | T-55 | TC-ANN-04 | Designed |

### 2.6 Merchandise (PR §8)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-MER-01 | §8.1 | Club-specific catalogue: T-shirts, hoodies, others; categories, descriptions, prices, sizes | §2.1 | §2.8 | product_categories, products, product_variants | products endpoints | Shop, product mgmt | T-60 | validation | Designed |
| PR-MER-02 | §8.1/§8.3 | Quantity per product and size, by club | §7.3 | §2.8 | product_variants | `/c/:id/inventory` | Inventory | T-61 | TC-MER-01 | Designed |
| PR-MER-03 | §8.1 | Membership discounts on merchandise | §2.1 | §2.6 | products.member_discount_eligible | quote | Shop prices | T-40, T-62 | TC-MER-05 | Designed |
| PR-MER-04 | §8.1 | Early-bird / time-limited offers | — | §2.6, §3.1 products | products.offer_* | quote | Shop | T-40, T-60 | TC-MER-05 | Designed |
| PR-MER-05 | §8.1 | Availability and orderability | — | §2.8 | products.status, variants.is_active | — | Shop | T-60 | API tests | Designed |
| PR-MER-06 | §8.2 | Validate price, benefits and inventory at purchase | ADR-005 | §5.9 | — | `POST /c/:id/orders` | Checkout | T-62 | TC-MER-02/05 | Designed |
| PR-MER-07 | §8.2 | Stock decremented at correct lifecycle point (payment success); relationship of order/payment/reservation/cancellation | ADR-007 | §2.8 | orders, stock_movements | — | — | T-62 | TC-MER-03 | Designed |
| PR-MER-08 | §8.2 | Prevent overselling under concurrency | ADR-007 | §3.2 | product_variants CHECK | — | — | T-62, T-90 | TC-MER-02 | Designed |
| PR-MER-09 | §8.2 | Unique pickup identifier | — | §2.8 | orders.pickup_code | `/c/:id/pickups` | Order detail | T-63 | TC-MER-06 | Designed |
| PR-MER-10 | §8.2 | User sees order history, status, payment status, pickup info | — | §4.7 | orders, payments | `/me/orders` | My orders | T-62, T-63 | API tests | Designed |
| PR-MER-11 | §8.2/§8.3 | Club order-management view | — | §4.7 | orders | `GET /c/:id/orders` | Club orders | T-63 | TC-AZ-01 | Designed |
| PR-MER-12 | §8.2 | Simulated payment outcomes, no real gateway | ADR-010 | §2.10 | payments | simulate | Checkout | T-32 | TC-PAY-01 | Designed |
| PR-MER-13 | §8.3 | Low-stock alerts with configurable threshold; duplicates controlled | §10 | §2.8, §5.10 | low_stock_alerts | `/c/:id/low-stock-alerts`, `PATCH /variants/:id` | Alerts | T-61 | TC-MER-04 | Designed |
| PR-MER-14 | §8.3 | Units sold, revenue, sales stats, order & payment history | §8 | §5.15 | order_items, financial_transactions | `/c/:id/reports/merchandise` | Reports | T-85 | TC-RPT-02 | Designed |

### 2.7 Finance (PR §9)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-FIN-01 | §9.1 | Track dues & renewals, tickets, merchandise, fundraiser income, payment statuses, references | ADR-015 | §2.10 | financial_transactions, payments | transactions, `/c/:id/payments`, income-entries | Finance pages | T-32, T-82 | TC-FIN-03 | Designed |
| PR-FIN-02 | §9.2 | Record expenses with manual amount | — | §2.10 | expenses | `POST /c/:id/expenses` | Expense form | T-81 | API tests | Designed |
| PR-FIN-03 | §9.2 | Upload receipts / proof | §9 | §8 | uploaded_files | multipart, receipt download | Upload field | T-80 | TC-FIN-06 | Designed |
| PR-FIN-04 | §9.2 | Associate expense with club and event or fundraiser | — | §3.1 expenses | expenses.event_id/fundraiser_id | — | Expense form | T-81 | validation | Designed |
| PR-FIN-05 | §9.2 | Submit, review, approve/reject reimbursements by authorised users | §2.3, OD-06 | §2.10 | expenses | approve/reject | Review queue | T-81 | TC-FIN-01 | Designed |
| PR-FIN-06 | §9.2 | Record decision, decision-maker, time; track until completion | — | §3.1 expenses | expenses.decided_* / paid_* | — | Expense detail | T-81 | TC-FIN-02 | Designed |
| PR-FIN-07 | §9.2 | Lifecycle distinguishes submitted, approved, paid | — | §2.10 | expenses.status | mark-paid | Status badges | T-81 | TC-FIN-02 | Designed |
| PR-FIN-08 | §9.3 | Club-level budgets | — | §2.10 | budgets | `/c/:id/budgets` | Budgets panel | T-82 | budget tests | Designed |
| PR-FIN-09 | §9.3 | Available balance, total income, approved vs paid expenses, pending totals, explicit formulas | — | §2.10 | — | finance summary | Summary cards | T-83 | TC-FIN-03 | Designed |
| PR-FIN-10 | §9.3 | Pending not subtracted except in labelled projected balance | — | §2.10 | — | summary | Labelled card | T-83 | TC-FIN-02 | Designed |
| PR-FIN-11 | §9.3 | Summaries, income/expense statistics, transaction history | §8 | §4.9, §4.10 | — | transactions, reports/finance | Finance dashboard | T-83 | TC-FIN-03 | Designed |
| PR-FIN-12 | §9.4 | Auditable transaction fields (id, club, type, amount, currency, related entity, status, time, responsible user, approver, reference/evidence) | ADR-015 | §3.1 financial_transactions | financial_transactions, audit_logs | transactions | Transactions table | T-32, T-83 | TC-FIN-04/05 | Designed |
| PR-FIN-13 | §9.4 | Prevent unauthorised or duplicate financial updates | §7.3 | §3.2, §5.12 | unique source, triggers | — | — | T-24, T-32 | TC-PAY-01, TC-FIN-01 | Designed |

### 2.8 Fundraisers (PR §10)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-FUN-01 | §10 | Create fundraiser projects | — | §2.9 | fundraisers | `POST /c/:id/fundraisers` | Fundraiser list | T-70 | API tests | Designed |
| PR-FUN-02 | §10 | Tasks per fundraiser | — | §2.9 | fundraiser_tasks | `POST /fundraisers/:id/tasks` | Task board | T-70 | API tests | Designed |
| PR-FUN-03 | §10 | Assign responsibilities to volunteers | — | §2.9 | assignee_user_id | tasks | Assignee picker | T-70 | TC-FUN-02 | Designed |
| PR-FUN-04 | §10 | Task descriptions and deadlines | — | §3.1 | fundraiser_tasks | — | Task form | T-70 | validation | Designed |
| PR-FUN-05 | §10 | Status and progress tracking | — | §2.9 | status, progress_percent | `PATCH /tasks/:id` | Task card | T-70 | TC-FUN-01 | Designed |
| PR-FUN-06 | §10 | Pending and overdue identification | — | §2.9 | — | overview | Overdue badges | T-71 | TC-FUN-01 | Designed |
| PR-FUN-07 | §10 | Project overview: complete vs remaining | — | §2.9 | — | overview | Overview | T-71 | TC-FUN-01 | Designed |
| PR-FUN-08 | §10 | On-track indicator with defined calculation | — | §2.9 | — | overview | Health badge | T-71 | TC-FUN-01 | Designed |
| PR-FUN-09 | §10 | Associate expenses and income with fundraiser | — | §2.9, §2.10 | expenses.fundraiser_id, ledger.fundraiser_id | expenses, income-entries | Overview money | T-71, T-82 | TC-FIN-03 | Designed |
| PR-FUN-10 | §4.5 | Volunteers view own tasks/deadlines, update progress, participate | — | §4.8 | — | `/me/tasks` | My tasks | T-70 | TC-FUN-02 | Designed |

### 2.9 Technology, architecture, quality and documentation (PR §3, §11–§18)

| ID | Source | Requirement | HLD | LLD | DB | API | Frontend | Task | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PR-TECH-01 | §3 | React, Node/Express, PostgreSQL, Docker; JavaScript | header, §5 | §1 | — | — | — | T-10 | lint/build | Designed |
| PR-TECH-02 | §3, §11.11 | Docker Compose local run, env config, setup instructions, migrations, health checks, volumes | §11 | §1.3 | — | `/health` | — | T-11, T-93 | T-93 checklist | Designed |
| PR-TECH-03 | §3, §11.4 | Modular monolith; no mandatory Redis/Kafka/K8s/microservices/cloud | §4, ADR-001 | §1.2 | — | — | — | T-10 | dependency-cruiser | Designed |
| PR-TECH-04 | §11.9 | Security architecture items | §9 | §9 | audit_logs | — | — | T-12, T-92 | T-92 checklist, NFR-02 | Designed |
| PR-TECH-05 | §12.10 | Unit, integration, API, DB, E2E testing with listed cases | §12 | §10 | — | — | — | T-15, T-90, T-94 | all TC-* | Designed |
| PR-TECH-06 | §14–15 | Design patterns evaluated; SOLID checklist | §13 | — | — | — | — | — | Codex review | Designed (`ARCHITECTURE_DECISIONS.md` §D–E) |
| PR-DOC-01 | §17 | Five documents with real content and Mermaid diagrams | all | all | — | — | — | T-102 | Codex review | Designed |
| PR-DOC-02 | §18 | Independent Codex review before implementation | header | header | — | — | — | T-00 | — | Pending review |
| PR-DOC-03 | §16 | Cross-document consistency validated | — | — | — | — | — | T-00 | — | Designed (`ARCHITECTURE_DECISIONS.md` §F) |

### 2.10 Non-functional requirements (HLD §12)

| ID | Requirement | Task | Test | Status |
|---|---|---|---|---|
| NFR-01 | Auth required; club-scoped 403/404 | T-23, T-91 | TC-AZ-01 | Designed |
| NFR-02 | No secrets/tokens in logs | T-12, T-92 | redaction unit test | Designed |
| NFR-03 | Capacity exact under concurrency | T-43, T-90 | TC-EVT-01 | Designed |
| NFR-04 | One check-in under concurrent scans | T-44, T-90 | TC-CHK-03 | Designed |
| NFR-05 | No negative inventory | T-62, T-90 | TC-MER-02 | Designed |
| NFR-06 | No duplicate ledger rows | T-32, T-90 | TC-PAY-01 | Designed |
| NFR-07 | Ledger auditable; summary = ledger sum | T-83 | TC-FIN-05 | Designed |
| NFR-08 | Notification failure isolated, retried | T-50 | TC-ANN-03 | Designed |
| NFR-09 | Restart-safe jobs | T-51 | TC-REM-02, TC-AP-02 | Designed |
| NFR-10 | Check-in p95 target (to validate) | T-90 | perf smoke | Designed |
| NFR-11 | 360 px usability; scanner clarity | T-95 | manual checklist | Designed |
| NFR-12 | Error envelope with requestId | T-12 | unit | Designed |
| NFR-13 | Layering & module rules | T-10 | dependency-cruiser | Designed |
| NFR-14 | Injectable adapters/clock | T-15 | harness | Designed |
| NFR-15 | Reproducible Compose run | T-93 | T-93 checklist | Designed |

## 3. Assumptions and open decisions mapping

| ID | Affects requirements | Where resolved |
|---|---|---|
| ASM-01 | PR-ROLE-03, PR-ROLE-07 | LLD §2.2 |
| ASM-02 / OD-02 | PR-MEM-02 | LLD §2.1 |
| ASM-03 | PR-MEM-03, PR-ROLE-02 | LLD §4.3 |
| ASM-04 / OD-07 | PR-EVT-09 | LLD §2.5 |
| ASM-05 | PR-EVT-17 | LLD §2.6 |
| ASM-06 | PR-EVT-07 | LLD §2.5 |
| ASM-07 | PR-ROLE-04 | LLD §2.5 |
| ASM-08, ASM-10 / OD-05 | PR-MEM-07, PDF-05 | LLD §2.4 |
| ASM-09 | PR-MEM-09 | LLD §5.3 |
| ASM-11 | PR-MER-01 | LLD §2.8 |
| ASM-12 | PDF-21 | HLD §2.3 |
| ASM-13 | PR-EVT-06, PR-MER-07 | LLD §7 |
| ASM-14 | PR-ROLE-01 (event communications) | LLD §2.7 |
| OD-01 | PR-EVT-08, PR-MER-03/04 | LLD §2.6 |
| OD-03 | PR-MEM-05, PR-EVT-05 | LLD §2.6 |
| OD-04 | PR-MEM-11 | LLD §5.4 |
| OD-06 | PR-FIN-05 | LLD §2.10 |
| OD-08 | PR-EVT-16 | LLD §2.5, §5.15 |
| OD-09 | PR-FIN-09 | not implemented unless approved |

Coverage check: 23 PDF requirements, 95 prompt requirements (incl. tech/doc), 15 NFRs — every row maps to at least one task and one test or review step. No row is unmapped.
