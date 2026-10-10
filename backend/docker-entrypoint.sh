#!/bin/sh
# Migrate, then start (LLD §1.1). Seeds are not run yet: they need Group 1 tables (T-93).
set -e
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi
npx knex migrate:latest
exec "$@"
