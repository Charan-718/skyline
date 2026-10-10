# SOMS backend

Node 20 + Express (ESM), PostgreSQL 16, Knex. Layout and contracts: `docs/LLD.md`.
Group 2 scope and decisions: `docs/GROUP_2_SCOPE_MAP.md`, `docs/GROUP_2_OPEN_QUESTIONS.md`.

## Fresh start

```sh
cp .env.example .env          # optional; docker-compose.yml has dev defaults
docker compose up --build -d  # db + backend; entrypoint runs migrations, then the server
curl localhost:4000/api/v1/health   # {"status":"ok","db":"ok"}
```

`GROUP1_SCHEMA` (TODO(group1): delete when Group 1 merges):

| Value | Effect |
|---|---|
| `fixture` (Compose default) | applies `tests/fixtures/group1_schema.sql` in place of Group 1 migrations 002/003/006/007 |
| `external` | skips Group 1 migrations; their tables must already exist |
| `migrations` (production default) | runs every migration file; fails at 004 until Group 1's migrations exist |

## Tests

Run inside the backend container (Node 20, real PostgreSQL `soms_test`):

```sh
docker compose exec backend npm test              # full suite
docker compose exec backend npm run test:unit
docker compose exec backend npm run test:concurrency
docker compose exec backend npm run lint          # ESLint + dependency-cruiser + no-float grep test
```

## Migration rollback check

```sh
docker compose exec backend npx knex migrate:rollback --all
docker compose exec backend npx knex migrate:latest
```

`tests/integration/migrations.test.js` repeats latest → rollback → latest on a scratch database.
