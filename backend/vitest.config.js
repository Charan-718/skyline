import { defineConfig } from 'vitest/config';

// Unit, integration, API and concurrency tests share one real PostgreSQL test database
// (soms_test, migrated fresh per run by globalSetup). Files run one at a time because each
// file truncates the database; concurrency inside a file uses separate pool connections.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/helpers/globalSetup.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { NODE_ENV: 'test' },
  },
});
