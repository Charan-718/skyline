process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://soms:soms@localhost:5432/soms_test';
process.env.COLLEGE_VERIFICATION_MODE = 'mock';
process.env.NOTIFY_MODE = 'dev';
