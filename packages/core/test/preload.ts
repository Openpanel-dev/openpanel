// Preloaded into every `bun test` process (bunfig.toml `[test] preload`).
//
// `preload` runs per test PROCESS, not once per run — bun test has no
// `globalSetup` — so everything here must be idempotent and cheap.
//
// The pins below are a safety property, not a convenience: they are the
// successor to vitest.shared.ts's "always point at local Docker — never
// production, regardless of .env". A test must not be able to reach a real
// database because someone's .env happened to be loaded.
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
process.env.CLICKHOUSE_URL = 'http://localhost:8123/openpanel';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SELF_HOSTED = 'true';
