# SOMS Group 1 — cURL walkthrough

Base URL: `http://localhost:4000/api/v1`  
Use a cookie jar for sessions. All **POST/PATCH/DELETE** need `X-Requested-With: soms`.  
Idempotent POSTs need `Idempotency-Key: $(uuidgen)` (macOS).

```bash
export BASE=http://localhost:4000/api/v1
export COOKIES=/tmp/soms-cookies.txt
export IDEM=$(uuidgen)
export CSRF='X-Requested-With: soms'
```

## 0. Health

```bash
curl -s "$BASE/health" | jq
```

## 1. Auth

```bash
# Register club head (must verify as college student; required before assign-club-head)
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"email":"clubhead@skyline.ac.in","password":"SecurePass1!","fullName":"Club Head User","studentIdentifier":"SKY2023AD001"}' | jq

# Register member (name must match mock for verification)
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"email":"asha.rao@skyline.ac.in","password":"SecurePass1!","fullName":"Asha Rao"}' | jq

# Login head
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"email":"clubhead@skyline.ac.in","password":"SecurePass1!"}' | jq

curl -s -b "$COOKIES" "$BASE/auth/me" | jq
```

## 2. Club (CLI — not HTTP)

```bash
cd backend
npm run cli -- create-club skyline "Skyline Association" SKY
# copy club id from output
export CLUB_ID=<uuid>
npm run cli -- assign-club-head "$CLUB_ID" clubhead@skyline.ac.in
```

```bash
curl -s "$BASE/clubs" | jq
curl -s "$BASE/clubs/$CLUB_ID" | jq
curl -s -b "$COOKIES" "$BASE/clubs/$CLUB_ID/roles" | jq
```

## 3. Member verification (login as member first)

```bash
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"email":"asha.rao@skyline.ac.in","password":"SecurePass1!"}' | jq

curl -s -b "$COOKIES" -X POST "$BASE/me/college-verification" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"studentIdentifier":"SRKR2023CS001","fullName":"Asha Rao"}' | jq
```

## 4. Plan + membership + payment

Login as **club head**, create plan:

```bash
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"email":"clubhead@skyline.ac.in","password":"SecurePass1!"}' | jq

curl -s -b "$COOKIES" -X POST "$BASE/clubs/$CLUB_ID/plans" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"name":"Annual","feePaise":50000,"durationMonths":12,"eventDiscountBps":1000}' | jq
# export PLAN_ID=...
```

Login as **member**, join:

```bash
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"email":"asha.rao@skyline.ac.in","password":"SecurePass1!"}' | jq

export IDEM=$(uuidgen)
curl -s -b "$COOKIES" -X POST "$BASE/clubs/$CLUB_ID/memberships" \
  -H "Content-Type: application/json" -H "$CSRF" -H "Idempotency-Key: $IDEM" \
  -d "{\"planId\":\"$PLAN_ID\",\"expectedFeePaise\":50000}" | jq
# export PAYMENT_ID=...
```

Simulate payment:

```bash
export IDEM=$(uuidgen)
curl -s -b "$COOKIES" -X POST "$BASE/payments/$PAYMENT_ID/simulate" \
  -H "Content-Type: application/json" -H "$CSRF" -H "Idempotency-Key: $IDEM" \
  -d '{"outcome":"SUCCEEDED"}' | jq

curl -s -b "$COOKIES" "$BASE/me/memberships" | jq
```

## 5. Events

Login as club head, create event:

```bash
curl -s -b "$COOKIES" -X POST "$BASE/clubs/$CLUB_ID/events" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{
    "title":"Spring Gala","venue":"Hall",
    "startsAt":"2026-12-01T18:00:00.000Z","endsAt":"2026-12-01T22:00:00.000Z",
    "registrationOpensAt":"2026-06-01T00:00:00.000Z","registrationClosesAt":"2026-11-30T23:59:59.000Z",
    "capacity":100,"memberPricePaise":20000,"nonMemberPricePaise":30000
  }' | jq
# export EVENT_ID=...
```

Add organizer (SQL until PUT /organizers is implemented):

```bash
docker exec -i skyline-pg psql -U soms -d soms -f - <<SQL
INSERT INTO event_organizers (event_id, user_id, assigned_by)
SELECT '$EVENT_ID'::uuid, id, id FROM users WHERE email='clubhead@skyline.ac.in';
SQL
```

Publish, quote, book:

```bash
curl -s -b "$COOKIES" -X POST "$BASE/events/$EVENT_ID/publish" -H "$CSRF" | jq
curl -s -b "$COOKIES" "$BASE/events/$EVENT_ID/price-quote" | jq

export IDEM=$(uuidgen)
export FINAL=20000   # from price-quote
curl -s -b "$COOKIES" -X POST "$BASE/events/$EVENT_ID/bookings" \
  -H "Content-Type: application/json" -H "$CSRF" -H "Idempotency-Key: $IDEM" \
  -d "{\"expectedFinalPricePaise\":$FINAL}" | jq
```

## 6. Announcements

```bash
curl -s -b "$COOKIES" -X POST "$BASE/clubs/$CLUB_ID/announcements" \
  -H "Content-Type: application/json" -H "$CSRF" \
  -d '{"title":"Meeting","body":"See you Monday","category":"MEETING","audience":"MEMBERS"}' | jq

export IDEM=$(uuidgen)
curl -s -b "$COOKIES" -X POST "$BASE/announcements/$ANNOUNCEMENT_ID/publish" \
  -H "$CSRF" -H "Idempotency-Key: $IDEM" | jq

curl -s "$BASE/announcements" | jq
```

## 7. Event report

```bash
curl -s -b "$COOKIES" "$BASE/events/$EVENT_ID/report" | jq
```

## Not yet exposed in HTTP (LLD only)

These exist in docs/DB but have **no routes** in this Group 1 slice yet: event organizers/staff CRUD, `/me/tickets`, club member list, AutoPay PUT, `/dev/jobs`, archive plan, etc. Use Postman collection folder names as the source of truth for **implemented** endpoints.
