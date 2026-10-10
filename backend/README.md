# SOMS Backend (Group 1 — Engagement)

Node.js 20+ Express modular monolith for auth, clubs, memberships, pricing, events, announcements, event reporting, and membership jobs. Finance payments/ledger and notifications include **G2-STUB** implementations so Group 1 integration tests run without Group 2.

## Setup

```bash
cp ../.env.example ../.env   # or export DATABASE_URL
cd backend
npm install
npm run migrate
npm start                    # http://localhost:4000/api/v1/health
```

PostgreSQL 16 required. Tests use `TEST_DATABASE_URL` or `DATABASE_URL` (database `soms_test` recommended).

```bash
npm test
```

## CLI (ASM-01)

```bash
npm run cli -- create-club --slug skyline --name "Skyline Association" --prefix SKY
npm run cli -- assign-club-head --club-id <uuid> --email head@srkr.ac.in
```

## Module layout

See `docs/LLD.md` §1.1. Composition root: `src/container.js`. Payment handlers registered for `MEMBERSHIP_JOIN`, `MEMBERSHIP_RENEWAL`, `EVENT_TICKET`.

## Migrations owned here

002, 003, 006, 007; plus minimal 009/011/012 stubs coordinated with Group 2.
