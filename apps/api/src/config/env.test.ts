import { describe, expect, it } from 'bun:test';
import {
  concurrencyEnvKey,
  concurrencyOverride,
  ENABLED_QUEUE_VALUES,
  loadConfig,
} from './env';

// `loadConfig` takes its source, so nothing here touches process.env.
const base = { ROLE: 'worker' } as NodeJS.ProcessEnv;

describe('ROLE', () => {
  it('defaults to api and accepts the three roles', () => {
    expect(loadConfig({}).ROLE).toBe('api');
    for (const role of ['api', 'worker', 'all'] as const) {
      expect(loadConfig({ ROLE: role }).ROLE).toBe(role);
    }
  });

  it('fails boot loudly on an unknown value, naming it', () => {
    expect(() => loadConfig({ ROLE: 'wroker' })).toThrow(
      /unknown value "wroker"/
    );
  });
});

describe('ENABLED_QUEUES', () => {
  it('is every known consumer when unset', () => {
    expect(loadConfig(base).ENABLED_QUEUES).toEqual([...ENABLED_QUEUE_VALUES]);
  });

  it('covers the Kafka token plus the seven registry queues', () => {
    expect(ENABLED_QUEUE_VALUES).toEqual([
      'events',
      'sessions',
      'cron',
      'notification',
      'import',
      'insights',
      'gsc',
      'cohortCompute',
    ]);
  });

  it('parses the cloud split (docs/ANSWERS.md 1.3)', () => {
    expect(
      loadConfig({ ...base, ENABLED_QUEUES: 'events' }).ENABLED_QUEUES
    ).toEqual(['events']);
    expect(
      loadConfig({ ...base, ENABLED_QUEUES: ' sessions , cron ' })
        .ENABLED_QUEUES
    ).toEqual(['sessions', 'cron']);
  });

  it('rejects an unknown token instead of silently idling (V1 ignored it)', () => {
    expect(() =>
      loadConfig({ ...base, ENABLED_QUEUES: 'sessions,nope' })
    ).toThrow(/unknown queue "nope"/);
  });

  it('names the rename when it sees the old events_kafka spelling', () => {
    expect(() =>
      loadConfig({ ...base, ENABLED_QUEUES: 'events_kafka' })
    ).toThrow(/"events_kafka" was renamed to "events"/);
  });
});

describe('<QUEUE>_CONCURRENCY', () => {
  it('keeps V1 key derivation — cohortCompute reads COHORTCOMPUTE_CONCURRENCY', () => {
    expect(concurrencyEnvKey('cohortCompute')).toBe(
      'COHORTCOMPUTE_CONCURRENCY'
    );
    const config = loadConfig({ ...base, COHORTCOMPUTE_CONCURRENCY: '9' });
    expect(concurrencyOverride(config, 'cohortCompute')).toBe(9);
  });

  it('is undefined when unset, so the registry default stands', () => {
    expect(concurrencyOverride(loadConfig(base), 'sessions')).toBeUndefined();
  });

  it('ignores a non-numeric or non-positive value, as V1 did', () => {
    expect(
      concurrencyOverride(
        loadConfig({ ...base, SESSIONS_CONCURRENCY: 'lots' }),
        'sessions'
      )
    ).toBeUndefined();
    expect(
      concurrencyOverride(
        loadConfig({ ...base, SESSIONS_CONCURRENCY: '0' }),
        'sessions'
      )
    ).toBeUndefined();
  });
});

describe('the boot flags main.ts branches on', () => {
  it('DISABLE_WORKERS is any defined value; DISABLE_BULLBOARD is 1 or true', () => {
    expect(loadConfig(base).DISABLE_WORKERS).toBe(false);
    expect(loadConfig({ ...base, DISABLE_WORKERS: '0' }).DISABLE_WORKERS).toBe(
      true
    );

    expect(loadConfig(base).DISABLE_BULLBOARD).toBe(false);
    expect(
      loadConfig({ ...base, DISABLE_BULLBOARD: '1' }).DISABLE_BULLBOARD
    ).toBe(true);
    expect(
      loadConfig({ ...base, DISABLE_BULLBOARD: 'true' }).DISABLE_BULLBOARD
    ).toBe(true);
    // V1 only ever accepted those two spellings.
    expect(
      loadConfig({ ...base, DISABLE_BULLBOARD: 'yes' }).DISABLE_BULLBOARD
    ).toBe(false);
  });

  it('QUEUE_NAMESPACE and QUEUE_CLUSTER default to off, so queue keys are V1s', () => {
    const config = loadConfig(base);
    expect(config.QUEUE_CLUSTER).toBe(false);
    expect(config.QUEUE_NAMESPACE).toBeUndefined();
  });

  it('reports every problem at once, never just the first', () => {
    expect(() =>
      loadConfig({ ROLE: 'nope', ENABLED_QUEUES: 'alsonope' })
    ).toThrow(/unknown value "nope"[\s\S]*unknown queue "alsonope"/);
  });
});

// --- M15-006: the parsing core used to do for itself -------------------------

describe('blank KEY= is absent, not empty', () => {
  it('falls through to the default on every field, not just the preprocessed ones', () => {
    const config = loadConfig({ ...base, API_PORT: '', LOG_LEVEL: '   ' });
    expect(config.API_PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.SHUTDOWN_FORCE_EXIT_MS).toBe(20_000);
  });

  it('treats a blank SELF_HOSTED as unset rather than as the string ""', () => {
    expect(loadConfig({ ...base, SELF_HOSTED: '' }).core.selfHosted).toBe(
      false
    );
    expect(loadConfig({ ...base, SELF_HOSTED: 'true' }).core.selfHosted).toBe(
      true
    );
    // One truthiness rule tree-wide: `1` counts, anything else does not.
    expect(loadConfig({ ...base, SELF_HOSTED: '1' }).core.selfHosted).toBe(
      true
    );
    expect(loadConfig({ ...base, SELF_HOSTED: 'yes' }).core.selfHosted).toBe(
      false
    );
  });
});

describe('tuning knobs keep the module default on a malformed value', () => {
  const malformed = ['0', '-1', '7.5', '7days', 'junk', ''];

  it('EVENT_LIST_MAX_LOOKBACK_DAYS / SESSION_LIST_MAX_LOOKBACK_DAYS', () => {
    for (const bad of malformed) {
      const config = loadConfig({
        ...base,
        EVENT_LIST_MAX_LOOKBACK_DAYS: bad,
        SESSION_LIST_MAX_LOOKBACK_DAYS: bad,
      });
      expect(config.core.query.eventListMaxLookbackDays).toBeUndefined();
      expect(config.core.query.sessionListMaxLookbackDays).toBeUndefined();
    }

    const config = loadConfig({
      ...base,
      EVENT_LIST_MAX_LOOKBACK_DAYS: '7',
      SESSION_LIST_MAX_LOOKBACK_DAYS: '3650',
    });
    expect(config.core.query.eventListMaxLookbackDays).toBe(7);
    expect(config.core.query.sessionListMaxLookbackDays).toBe(3650);
  });

  it('reads each list its own variable — no cross-talk', () => {
    const config = loadConfig({ ...base, EVENT_LIST_MAX_LOOKBACK_DAYS: '7' });
    expect(config.core.query.eventListMaxLookbackDays).toBe(7);
    expect(config.core.query.sessionListMaxLookbackDays).toBeUndefined();
  });

  it('COHORT_QUERY_MEMORY_LIMIT_BYTES / COHORT_QUERY_SPILL_BYTES', () => {
    const config = loadConfig({
      ...base,
      COHORT_QUERY_MEMORY_LIMIT_BYTES: '2gb',
      COHORT_QUERY_SPILL_BYTES: '-1',
    });
    expect(config.core.query.cohortQueryMemoryLimitBytes).toBeUndefined();
    expect(config.core.query.cohortQuerySpillBytes).toBeUndefined();
  });
});

describe('derived values, computed once in the transform', () => {
  it('dashboardUrl is DASHBOARD_URL, unset means empty', () => {
    expect(loadConfig(base).core.dashboardUrl).toBe('');
    expect(
      loadConfig({ ...base, DASHBOARD_URL: 'https://own' }).core.dashboardUrl
    ).toBe('https://own');
  });

  it('clickhouseClustered is CLICKHOUSE_CLUSTER, else the inverse of SELF_HOSTED', () => {
    expect(loadConfig(base).core.clickhouseClustered).toBe(true);
    expect(
      loadConfig({ ...base, SELF_HOSTED: 'true' }).core.clickhouseClustered
    ).toBe(false);
    expect(
      loadConfig({ ...base, SELF_HOSTED: 'true', CLICKHOUSE_CLUSTER: '1' }).core
        .clickhouseClustered
    ).toBe(true);
  });

  it('the CORS allowlist, the verbose client ids and the listen address', () => {
    const config = loadConfig({
      ...base,
      DASHBOARD_URL: 'https://own',
      API_CORS_ORIGINS: ' https://a , https://b ',
      ENABLE_VERBOSE_LOGGING: 'c1,c2',
      API_HOST: '127.0.0.1',
      API_PORT: '4000',
    });
    expect(config.dashboardOrigins).toEqual([
      'https://own',
      'https://a',
      'https://b',
    ]);
    expect(config.verboseClientIds).toEqual(['c1', 'c2']);
    expect(config.listen).toEqual({ port: 4000, hostname: '127.0.0.1' });
    // No hostname unless API_HOST says one — Bun's `localhost` binds IPv6 only.
    expect(loadConfig(base).listen).toEqual({ port: 3000 });
  });

  it('the DLQ topic follows the events topic unless it is named', () => {
    expect(loadConfig(base).core.kafka.eventsDlqTopic).toBe('events-dlq');
    expect(
      loadConfig({ ...base, KAFKA_EVENTS_TOPIC: 'evt' }).core.kafka
        .eventsDlqTopic
    ).toBe('evt-dlq');
    expect(
      loadConfig({ ...base, KAFKA_EVENTS_DLQ_TOPIC: 'own' }).core.kafka
        .eventsDlqTopic
    ).toBe('own');
  });

  it('the log exporter and the stdout interception verdict', () => {
    expect(loadConfig(base).core.logging).toMatchObject({
      exporter: 'stdout',
      interceptProcessOutput: false,
    });
    expect(
      loadConfig({ ...base, HYPERDX_API_KEY: 'k' }).core.logging
    ).toMatchObject({ exporter: 'otlp', interceptProcessOutput: true });
    expect(
      loadConfig({ ...base, NODE_ENV: 'production' }).core.logging
    ).toMatchObject({ exporter: 'stdout', interceptProcessOutput: true });
  });

  it('ALLOW_REGISTRATION keeps "unset" distinct from "false"', () => {
    expect(loadConfig(base).core.auth.allowRegistration).toBeUndefined();
    expect(
      loadConfig({ ...base, ALLOW_REGISTRATION: 'false' }).core.auth
        .allowRegistration
    ).toBe(false);
    expect(
      loadConfig({ ...base, ALLOW_REGISTRATION: 'true' }).core.auth
        .allowRegistration
    ).toBe(true);
  });
});

describe('cross-field invariants, checked before the transform', () => {
  it('refuses a consuming role with nothing to consume', () => {
    expect(() => loadConfig({ ROLE: 'worker', ENABLED_QUEUES: ' , ' })).toThrow(
      /consumes queues but ENABLED_QUEUES names none/
    );
    // ROLE=api never consumes, so the same env is fine for it.
    expect(() =>
      loadConfig({ ROLE: 'api', ENABLED_QUEUES: ' , ' })
    ).not.toThrow();
  });

  it('refuses LOG_EXPORTER=otlp without a HyperDX key', () => {
    expect(() => loadConfig({ ...base, LOG_EXPORTER: 'otlp' })).toThrow(
      /LOG_EXPORTER=otlp requires HYPERDX_API_KEY/
    );
    expect(() =>
      loadConfig({ ...base, LOG_EXPORTER: 'otlp', HYPERDX_API_KEY: 'k' })
    ).not.toThrow();
  });

  it('refuses a Kafka heartbeat that cannot fit inside the session timeout', () => {
    expect(() =>
      loadConfig({
        ...base,
        KAFKA_SESSION_TIMEOUT_MS: '1000',
        KAFKA_HEARTBEAT_INTERVAL_MS: '1000',
      })
    ).toThrow(/must be below KAFKA_SESSION_TIMEOUT_MS/);
  });

  it('refuses a reaper deadman below the session idle window', () => {
    expect(() =>
      loadConfig({
        ...base,
        SESSION_TIMEOUT_MS: '60000',
        SESSION_REAPER_WALLCLOCK_DEADMAN_MS: '1000',
      })
    ).toThrow(/is below SESSION_TIMEOUT_MS/);
  });

  it('refuses a vacuum threshold that would race the reaper', () => {
    expect(() =>
      loadConfig({
        ...base,
        SESSION_TIMEOUT_MS: '60000',
        SESSION_VACUUM_STALE_THRESHOLD_MS: '60000',
      })
    ).toThrow(/must exceed the reaper deadman/);
  });

  it('refuses a profile-backfill project list with the flag off', () => {
    expect(() =>
      loadConfig({ ...base, EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS: 'p1' })
    ).toThrow(/the allowlist has no effect/);
    expect(() =>
      loadConfig({
        ...base,
        EXPERIMENTAL_PROFILE_BACKFILL: '1',
        EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS: 'p1',
      })
    ).not.toThrow();
  });
});
