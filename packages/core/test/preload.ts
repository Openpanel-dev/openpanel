// Preloaded into every `bun test` process (bunfig.toml `[test] preload`). It
// runs per test PROCESS (bun test has no `globalSetup`), so it must be
// idempotent and cheap.
//
// The pins below are a safety property: a test must not reach a real database
// because someone's .env happened to be loaded.
import {
  TEST_CLICKHOUSE_URL,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
} from '../../../test/databases';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.SELF_HOSTED = 'true';
// Unsubscribe links are HMAC-signed with no default secret, so a test that
// exercises one needs a key.
process.env.UNSUBSCRIBE_SECRET ||= 'test-unsubscribe-secret';
