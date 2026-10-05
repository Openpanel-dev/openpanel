// Preloaded into every `bun test` process (bunfig.toml `[test] preload`). It
// runs per test PROCESS (bun test has no `globalSetup`), so it must be
// idempotent and cheap.
//
// The pins below are a safety property: a test must not reach a real database
// because someone's .env happened to be loaded. Kept in step with
// test/databases.ts by hand.
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:23432/openpanel_test?schema=public';
process.env.CLICKHOUSE_URL = 'http://localhost:23123/openpanel_test';
process.env.REDIS_URL = 'redis://localhost:23379';
process.env.SELF_HOSTED = 'true';
// Unsubscribe links are HMAC-signed with no default secret, so a test that
// exercises one needs a key.
process.env.UNSUBSCRIBE_SECRET ||= 'test-unsubscribe-secret';
