// Preloaded into every `bun test` process (bunfig.toml `[test] preload`).
//
// `preload` runs per test PROCESS, not once per run — bun test has no
// `globalSetup` — so everything here must be idempotent and cheap.
//
// The pins below are a safety property, not a convenience: a test must not be
// able to reach a real database because someone's .env happened to be loaded.
// Kept in step with test/databases.ts by hand.
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:23432/openpanel_test?schema=public';
process.env.CLICKHOUSE_URL = 'http://localhost:23123/openpanel_test';
process.env.REDIS_URL = 'redis://localhost:23379';
process.env.SELF_HOSTED = 'true';
// Unsubscribe links are HMAC-signed and there is no default secret any more,
// so a test that exercises one needs a key just like a deployment does.
process.env.UNSUBSCRIBE_SECRET ||= 'test-unsubscribe-secret';
