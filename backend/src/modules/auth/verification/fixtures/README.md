# Mock college database (development)

`students.mock.json` is the **dummy college DB**. It is **not** copied into PostgreSQL. At runtime the mock adapter reads this file and answers: “Is this person a real Skyline student?”

## Universal auth (everyone)

| Step | Endpoint | Notes |
|------|----------|--------|
| Sign up | `POST /api/v1/auth/register` | Same for outsiders and students. Pick any password (min 8 chars). |
| Sign in | `POST /api/v1/auth/login` | Same for everyone — email + password. Session cookie `sid`. |
| Profile | `GET /api/v1/auth/me` | Shows `accountAudience` and `capabilities.verifiedStudent`. |

**There are no shared demo passwords in the database.** Passwords are whatever you set at **register**. For Postman/cURL we use **`SecurePass1!`** as a convention when creating test accounts.

## What happens on register

| Case | Example | `accountAudience` | Verified? |
|------|---------|-------------------|-----------|
| Outsider | `guest@gmail.com` | `OUTSIDER` | No |
| Fake `@skyline.ac.in` | Not in roster | **403** — no account created | — |
| Club head impersonation | e.g. `j3@skyline.ac.in` + name `Club Head User` | **403** `CLUB_HEAD_REGISTRATION_DENIED` | — |
| Real student | roster email + **exact** full name below | `COLLEGE_STUDENT` | Yes (college DB matched) |

College domain is configured with `COLLEGE_EMAIL_DOMAINS` (default `skyline.ac.in`).

Optional `studentIdentifier` on register adds a stronger roster check. If omitted, **email + fullName** must match a row in `students.mock.json`.

**Club head (`clubhead@skyline.ac.in`):** registration is **rejected (403)** unless email + full name match the roster row with `clubHeadEligible`. Assigning `CLUB_HEAD` (CLI or API) also requires verified + that same eligible email.

## Roster (register with these emails + names)

Use password **`SecurePass1!`** (or any 8+ char password) when you register each account the first time.

| Student ID | Full name (exact) | Email |
|------------|-------------------|-------|
| SKY2023AD001 | Club Head User | clubhead@skyline.ac.in (**club head only** — must match DB or register is **403**) |
| SRKR2023CS001 | Asha Rao | asha.rao@skyline.ac.in |
| SRKR2022ME042 | Ravi Kumar | ravi.kumar@skyline.ac.in |
| SRKR2024EC015 | Priya Nair | priya.nair@skyline.ac.in |
| SRKR2023IT088 | Arjun Mehta | arjun.mehta@skyline.ac.in |
| SRKR2021CS210 | Sneha Reddy | sneha.reddy@skyline.ac.in |
| SRKR2024ME031 | Karan Singh | karan.singh@skyline.ac.in |
| SRKR2023EE056 | Divya Iyer | divya.iyer@skyline.ac.in |
| SRKR2022CS177 | Mohammed Ali | mohammed.ali@skyline.ac.in |
| SRKR2024CS009 | Ananya Das | ananya.das@skyline.ac.in |
| SRKR2023CE044 | Vikram Patel | vikram.patel@skyline.ac.in |

## Quick API checks

**Student (verified after register):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' -H 'X-Requested-With: soms' \
  -d '{"email":"ravi.kumar@skyline.ac.in","password":"SecurePass1!","fullName":"Ravi Kumar"}'
```
Expect `"accountAudience":"COLLEGE_STUDENT"` and `"collegeVerification":{"outcome":"VERIFIED",...}`.

**Outsider:**
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' -H 'X-Requested-With: soms' \
  -d '{"email":"guest@gmail.com","password":"SecurePass1!","fullName":"Guest User"}'
```
Expect `"accountAudience":"OUTSIDER"`, `"collegeVerification":null`.

**List roster (dev):** `GET /api/v1/dev/college-roster` when `DEV_TOOLS_ENABLED=true`.

**Retry verification:** `POST /api/v1/me/college-verification` with `{ "studentIdentifier", "fullName" }` while logged in.

Magic student ID `MOCK-UNAVAILABLE` → adapter returns unavailable (503 on verify).

## Old `npm run seed`

Seed no longer creates pre-verified users. If you ran an older seed, you may have stale users in Postgres — use fresh emails or clean `users` / `college_verifications` in dev before re-testing register.
