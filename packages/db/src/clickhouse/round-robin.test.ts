import { describe, expect, it } from 'vitest';
import {
  type ErrorClass,
  classifyError,
  isRetriableConnectionError,
} from './round-robin';

/**
 * The contract: anything from the ClickHouse server (errors that traveled
 * back over a working connection) must NOT mark a node unhealthy. Only true
 * transport failures should.
 *
 * If you ever see a node getting incorrectly sin-binned in prod, add the
 * exact error message here as a `not retriable` case and update
 * isRetriableConnectionError to handle it.
 */
describe('isRetriableConnectionError', () => {
  describe('ClickHouse server errors — must NOT be retried', () => {
    const cases: Array<{ label: string; err: unknown }> = [
      {
        label: 'SQL syntax error',
        err: new Error(
          'Code: 62, DB::Exception: Syntax error: failed at position 42',
        ),
      },
      {
        label: 'Unknown identifier (e.g. wrong column)',
        err: new Error(
          "Code: 47, DB::Exception: Unknown identifier 'fooooo'",
        ),
      },
      {
        label: 'ILLEGAL_AGGREGATION',
        err: new Error(
          'Code: 184, DB::Exception: Aggregate function max(...) is found in WHERE',
        ),
      },
      {
        label: 'Missing columns',
        err: new Error(
          'Code: 47, DB::Exception: Missing columns: a, b while processing query',
        ),
      },
      {
        label: 'TOO_MANY_PARTS — back-pressure, not connectivity',
        err: new Error('Code: 252, DB::Exception: Too many parts in partition'),
      },
      {
        label: 'MEMORY_LIMIT_EXCEEDED',
        err: new Error(
          'Code: 241, DB::Exception: Memory limit (for query) exceeded',
        ),
      },
      {
        label: 'TIMEOUT_EXCEEDED — server-side query timeout',
        err: new Error(
          'Code: 159, DB::Exception: Timeout exceeded: elapsed 60.001 sec',
        ),
      },
      {
        label: 'Authentication denied',
        err: new Error('Code: 516, DB::Exception: Authentication failed'),
      },
      {
        label: 'CH error with DB::Exception type marker (no Code prefix)',
        err: Object.assign(new Error('some message'), {
          type: 'DB::Exception',
        }),
      },
      {
        label: 'CH error whose body happens to mention "connect"',
        err: new Error(
          'Code: 999, DB::Exception: Cannot connect to ZooKeeper',
        ),
      },
    ];

    for (const { label, err } of cases) {
      it(`is NOT retriable: ${label}`, () => {
        expect(isRetriableConnectionError(err)).toBe(false);
      });
    }
  });

  describe('Transport errors — must be retried on next node', () => {
    const cases: Array<{ label: string; err: unknown }> = [
      {
        label: 'ECONNREFUSED via err.code',
        err: Object.assign(new Error('connect ECONNREFUSED 10.1.0.18:8123'), {
          code: 'ECONNREFUSED',
        }),
      },
      {
        label: 'ECONNRESET via err.code',
        err: Object.assign(new Error('read ECONNRESET'), {
          code: 'ECONNRESET',
        }),
      },
      {
        label: 'ETIMEDOUT via err.code',
        err: Object.assign(new Error('connect ETIMEDOUT 10.1.0.20:8123'), {
          code: 'ETIMEDOUT',
        }),
      },
      {
        label: 'EHOSTUNREACH via err.code',
        err: Object.assign(new Error('No route to host'), {
          code: 'EHOSTUNREACH',
        }),
      },
      {
        label: 'EAI_AGAIN (transient DNS)',
        err: Object.assign(
          new Error('getaddrinfo EAI_AGAIN ch.internal'),
          { code: 'EAI_AGAIN' },
        ),
      },
      {
        label: 'EPIPE on broken socket',
        err: Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }),
      },
      {
        label: 'undici connect timeout',
        err: Object.assign(new Error('Connect Timeout Error'), {
          code: 'UND_ERR_CONNECT_TIMEOUT',
        }),
      },
      {
        label: 'undici headers timeout',
        err: Object.assign(new Error('Headers Timeout Error'), {
          code: 'UND_ERR_HEADERS_TIMEOUT',
        }),
      },
      {
        label: 'undici body timeout',
        err: Object.assign(new Error('Body Timeout Error'), {
          code: 'UND_ERR_BODY_TIMEOUT',
        }),
      },
      {
        label: 'plain socket hang up (no code)',
        err: new Error('socket hang up'),
      },
      {
        label: 'undici premature close',
        err: new Error('Premature close'),
      },
      {
        label: 'cause-chained ECONNREFUSED',
        err: Object.assign(new Error('Failed to fetch'), {
          cause: Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        }),
      },
      {
        label: 'deeply nested cause chain',
        err: Object.assign(new Error('outer wrapper'), {
          cause: Object.assign(new Error('middle wrapper'), {
            cause: Object.assign(new Error('inner socket hang up'), {
              code: 'ECONNRESET',
            }),
          }),
        }),
      },
    ];

    for (const { label, err } of cases) {
      it(`is retriable: ${label}`, () => {
        expect(isRetriableConnectionError(err)).toBe(true);
      });
    }
  });

  describe('classifyError — bucket split (node-down vs transient)', () => {
    const cases: Array<{
      label: string;
      err: unknown;
      expected: ErrorClass;
    }> = [
      // ── transient: don't sin-bin the node ────────────────────────────
      {
        label: 'ECONNRESET (stale keep-alive race — the common case)',
        err: Object.assign(new Error('read ECONNRESET'), {
          code: 'ECONNRESET',
        }),
        expected: 'transient',
      },
      {
        label: 'EPIPE (write to closed socket)',
        err: Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }),
        expected: 'transient',
      },
      {
        label: 'socket hang up (no code)',
        err: new Error('socket hang up'),
        expected: 'transient',
      },
      {
        label: 'undici Premature close',
        err: new Error('Premature close'),
        expected: 'transient',
      },
      {
        label: 'undici body timeout (server slow mid-stream, not down)',
        err: Object.assign(new Error('Body Timeout Error'), {
          code: 'UND_ERR_BODY_TIMEOUT',
        }),
        expected: 'transient',
      },
      {
        label: 'undici headers timeout',
        err: Object.assign(new Error('Headers Timeout Error'), {
          code: 'UND_ERR_HEADERS_TIMEOUT',
        }),
        expected: 'transient',
      },
      // ── node-down: sin-bin the node ──────────────────────────────────
      {
        label: 'ECONNREFUSED (node not listening)',
        err: Object.assign(new Error('connect ECONNREFUSED 10.1.0.18:8123'), {
          code: 'ECONNREFUSED',
        }),
        expected: 'node-down',
      },
      {
        label: 'EHOSTUNREACH (no route)',
        err: Object.assign(new Error('No route to host'), {
          code: 'EHOSTUNREACH',
        }),
        expected: 'node-down',
      },
      {
        label: 'connect ETIMEDOUT (TCP-connect timeout)',
        err: Object.assign(new Error('connect ETIMEDOUT 10.1.0.20:8123'), {
          code: 'ETIMEDOUT',
        }),
        expected: 'node-down',
      },
      {
        label: 'EAI_AGAIN (DNS down)',
        err: Object.assign(new Error('getaddrinfo EAI_AGAIN'), {
          code: 'EAI_AGAIN',
        }),
        expected: 'node-down',
      },
      {
        label: 'undici connect timeout',
        err: Object.assign(new Error('Connect Timeout Error'), {
          code: 'UND_ERR_CONNECT_TIMEOUT',
        }),
        expected: 'node-down',
      },
      // ── ch-server: propagate ────────────────────────────────────────
      {
        label: 'CH server SQL error',
        err: new Error('Code: 47, DB::Exception: Unknown identifier'),
        expected: 'ch-server',
      },
      {
        label: 'CH TIMEOUT_EXCEEDED (server-side query timeout)',
        err: new Error('Code: 159, DB::Exception: Timeout exceeded'),
        expected: 'ch-server',
      },
      // ── cause-chain preserves classification ─────────────────────────
      {
        label: 'wrapped error: outer is opaque, cause is ECONNRESET',
        err: Object.assign(new Error('Request failed'), {
          cause: Object.assign(new Error('read ECONNRESET'), {
            code: 'ECONNRESET',
          }),
        }),
        expected: 'transient',
      },
      {
        label: 'wrapped error: outer is opaque, cause is ECONNREFUSED',
        err: Object.assign(new Error('Request failed'), {
          cause: Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        }),
        expected: 'node-down',
      },
    ];

    for (const { label, err, expected } of cases) {
      it(`classifies as ${expected}: ${label}`, () => {
        expect(classifyError(err)).toBe(expected);
      });
    }
  });

  describe('Unknown errors — must NOT be retried (safety default)', () => {
    const cases: Array<{ label: string; err: unknown }> = [
      { label: 'null', err: null },
      { label: 'undefined', err: undefined },
      { label: 'string', err: 'something went wrong' as unknown },
      { label: 'number', err: 42 as unknown },
      {
        label: 'plain Error with no recognizable shape',
        err: new Error('whatever happened was weird'),
      },
      {
        label: 'Error with unknown code',
        err: Object.assign(new Error('strange'), { code: 'EUNKNOWN' }),
      },
      {
        label: 'Error mentioning "connect" in a non-network context',
        // This is the kind of false-positive the old "Connect" substring
        // match was at risk of. Ensure the new matcher doesn't take the
        // bait — there's no system code and no precise transport keyword.
        err: new Error('Cannot connect the dots in this query plan'),
      },
    ];

    for (const { label, err } of cases) {
      it(`is NOT retriable: ${label}`, () => {
        expect(isRetriableConnectionError(err)).toBe(false);
      });
    }
  });
});
