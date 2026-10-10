# College student roster & verification

Skyline treats the college as the source of truth for **who is a student**. The app stores outcomes in `college_verifications`; the roster lives in **`college_student_roster`** when `COLLEGE_VERIFICATION_MODE=database`.

## Data model (`college_student_roster`)

| Column | Purpose |
|--------|---------|
| `student_identifier` | Roll / student ID (unique) |
| `full_name` | Name on college records |
| `college_email` | Official `@skyline.ac.in` (optional for roster-only rows) |
| `program` | e.g. `B.Tech CSE 2023` |
| `club_head_eligible` | May be assigned `CLUB_HEAD` after verify |
| `linked_user_id` | App account linked after successful verification |
| `is_active` | Soft-disable without deleting history |

Seeds (`004_college_roster.js`):

1. Rows from `students.mock.json`
2. **150** additional `SKY2025…` students (roster-only, for outsider verify demos)
3. Sync every `@skyline.ac.in` **app user** into the roster and set `linked_user_id`

## Verification modes

| `COLLEGE_VERIFICATION_MODE` | Source |
|-----------------------------|--------|
| `database` (default dev) | Postgres `college_student_roster` |
| `mock` | `students.mock.json` (tests) |
| `unconfigured` | Always `UNAVAILABLE` |

### Matching rules (database adapter)

- **Roll + full name** — primary path for `POST /me/college-verification`.
- **Account email** — if the user’s login email is a **college domain**, it must match `college_email` on the roster row.
- **Outsider email** (e.g. Gmail) — roll + name only; login email need not match roster email (e.g. Priya on Gmail + `SKY2024EC017`).

Register with `@skyline.ac.in`: adapter runs at signup with **email + full name** (no roll on the register form).

## Implemented API (dev)

### `GET /api/v1/dev/college-roster`

Requires `DEV_TOOLS_ENABLED=true` and `COLLEGE_VERIFICATION_MODE=database`.

Query: `q`, `page`, `pageSize` (max 200), `linkedOnly=true|false`.

Response includes `stats` (total, linked accounts, club-head eligible) and paginated `items` (no secrets).

## Planned API (college IT — not implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/internal/college-roster` | Paginated roster (mTLS / service token) |
| `POST` | `/api/v1/internal/college-roster/bulk` | Upsert CSV/JSON batch from SIS |
| `PATCH` | `/api/v1/internal/college-roster/:studentIdentifier` | Update one row, deactivate |
| `GET` | `/api/v1/internal/college-roster/:studentIdentifier` | Single row for support |

Auth: college integration identity, not student session. Rate limits and audit on every mutation.

## Student-facing (existing)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/v1/me/college-verification` | `{ studentIdentifier, fullName }` |
| `GET` | `/api/v1/me/college-verification` | Status: `NONE` / `NOT_VERIFIED` / `VERIFIED` |

## Ops

```bash
cd backend
npm run migrate    # creates college_student_roster
npm run seed       # 002/003 users + 004 roster (~158+ rows)
```

Restart backend after changing `COLLEGE_VERIFICATION_MODE`.
