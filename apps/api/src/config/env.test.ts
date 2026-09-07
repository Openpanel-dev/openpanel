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
