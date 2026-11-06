import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { getRedisCache } from '@openpanel/redis';
import { bufferDepsWithCh } from '../../test/buffer-fixtures';
import {
  ProfileBackfillBuffer,
  type ProfileBackfillEntry,
  supportsLightweightUpdate,
} from './profile-backfill-buffer';

const redis = getRedisCache();
const REDIS_KEY = 'profile-backfill-buffer';

interface Command {
  query: string;
  query_params?: Record<string, unknown>;
}
const commands: Command[] = [];
let serverVersion = '26.1.3.52';

const chCommand = mock(async (options: Command) => {
  commands.push(options);
});
const chQuery = mock(async () => ({
  json: async () => ({
    data: [{ version: serverVersion }],
    meta: [{ name: 'version', type: 'String' }],
    rows: 1,
  }),
}));

function makeBuffer() {
  return new ProfileBackfillBuffer(
    bufferDepsWithCh({ command: chCommand, query: chQuery })
  );
}

function entry(overrides: Partial<ProfileBackfillEntry> = {}) {
  return {
    projectId: 'proj-1',
    sessionId: 'sess-1',
    profileId: 'usr-1',
    startedAt: '2026-10-23 10:00:00',
    endedAt: '2026-10-23 10:30:00',
    ...overrides,
  } satisfies ProfileBackfillEntry;
}

/** The statement with its bound params substituted, for readable assertions. */
function rendered(command: Command): string {
  let text = command.query;
  for (const [name, value] of Object.entries(command.query_params ?? {})) {
    text = text.replaceAll(new RegExp(`\\{${name}:\\w+\\}`, 'g'), `'${value}'`);
  }
  return text.replace(/\s+/g, ' ');
}

beforeEach(async () => {
  await redis.del(REDIS_KEY, 'lock:profile-backfill');
  const markers = await redis.keys(`${REDIS_KEY}:views-done:*`);
  if (markers.length > 0) {
    await redis.del(...markers);
  }
  commands.length = 0;
  chCommand.mockClear();
  chQuery.mockClear();
  serverVersion = '26.1.3.52';
});

describe('supportsLightweightUpdate', () => {
  it('needs 25.8 or newer', () => {
    expect(supportsLightweightUpdate('24.3.2.23')).toBe(false);
    expect(supportsLightweightUpdate('25.7.1.1')).toBe(false);
    expect(supportsLightweightUpdate('25.8.1.1')).toBe(true);
    expect(supportsLightweightUpdate('25.10.2.65')).toBe(true);
    expect(supportsLightweightUpdate('26.1.3.52')).toBe(true);
    expect(supportsLightweightUpdate('')).toBe(false);
  });
});

describe('ProfileBackfillBuffer', () => {
  it('feeds the views, then rewrites only the anonymous rows of the sessions in their span', async () => {
    const buffer = makeBuffer();
    await buffer.add(entry());
    await buffer.add(
      entry({
        sessionId: 'sess-2',
        profileId: 'usr-2',
        startedAt: '2026-10-23 09:50:00',
        endedAt: '2026-10-23 10:05:00',
      })
    );

    await buffer.tryFlush({ trigger: 'cron' });

    expect(chCommand).toHaveBeenCalledTimes(4);
    const [cohort, summary, propertySummary, update] = commands.map(rendered);
    expect(cohort).toContain('INSERT INTO cohort_events_mv');
    expect(summary).toContain('INSERT INTO event_profile_summary_mv');
    expect(propertySummary).toContain(
      'INSERT INTO event_property_profile_summary_mv'
    );
    // The target is `events` or, clustered, `events_replicated ON CLUSTER`.
    expect(update).toStartWith('UPDATE events');
    expect(update).toContain('SET profile_id = CASE session_id');
    expect(update).toContain("WHEN 'sess-1' THEN 'usr-1'");
    expect(update).toContain("WHEN 'sess-2' THEN 'usr-2'");
    // Chunked in start order, so a late-closed old session cannot widen the
    // span of the fresh ones: sess-2 started first and leads although added last.
    expect(update).toContain(
      "(project_id, session_id) IN (('proj-1', 'sess-2'), ('proj-1', 'sess-1'))"
    );
    // Earliest start and latest end across the chunk, one second of padding.
    expect(update).toContain(
      "created_at BETWEEN toDateTime64('2026-10-23 09:50:00', 3) - toIntervalSecond('1') AND toDateTime64('2026-10-23 10:30:00', 3) + toIntervalSecond('1')"
    );
    expect(update).toContain('AND profile_id = device_id');
    expect(commands[3]?.query).not.toContain('now()');
    for (const statement of [cohort, summary, propertySummary]) {
      expect(statement).toContain('AND profile_id = device_id');
      expect(statement).toContain('AS resolved_profile_id');
    }
    expect(await redis.llen(REDIS_KEY)).toBe(0);
  });

  it('keeps the last entry per session', async () => {
    const buffer = makeBuffer();
    await buffer.add(entry({ profileId: 'usr-old' }));
    await buffer.add(entry({ profileId: 'usr-new' }));

    await buffer.tryFlush({ trigger: 'cron' });

    const update = rendered(commands.at(-1) as Command);
    expect(update).toContain("WHEN 'sess-1' THEN 'usr-new'");
    expect(update).not.toContain('usr-old');
  });

  it('drops the batch on a ClickHouse without lightweight UPDATE', async () => {
    serverVersion = '24.3.2.23';
    const buffer = makeBuffer();
    await buffer.add(entry());

    await buffer.tryFlush({ trigger: 'cron' });

    expect(chQuery).toHaveBeenCalledTimes(1);
    expect(chCommand).not.toHaveBeenCalled();
    expect(await redis.llen(REDIS_KEY)).toBe(0);
  });

  it('does not repeat the view inserts when the UPDATE fails and the batch is retried', async () => {
    const buffer = makeBuffer();
    await buffer.add(entry());
    chCommand
      .mockImplementationOnce(async (options) => {
        commands.push(options);
      })
      .mockImplementationOnce(async (options) => {
        commands.push(options);
      })
      .mockImplementationOnce(async (options) => {
        commands.push(options);
      })
      .mockImplementationOnce(() =>
        Promise.reject(new Error('clickhouse down'))
      );

    await buffer.tryFlush({ trigger: 'cron' });
    expect(chCommand).toHaveBeenCalledTimes(4);
    expect(await redis.llen(REDIS_KEY)).toBe(1);

    // A long-failing UPDATE must not outlive the markers: every retry renews them.
    const [marker] = await redis.keys(`${REDIS_KEY}:views-done:*`);
    await redis.expire(marker as string, 5);
    chCommand.mockImplementationOnce(() =>
      Promise.reject(new Error('still down'))
    );
    await buffer.tryFlush({ trigger: 'cron' });
    expect(chCommand).toHaveBeenCalledTimes(5);
    expect(await redis.ttl(marker as string)).toBeGreaterThan(3000);

    await buffer.tryFlush({ trigger: 'cron' });
    expect(chCommand).toHaveBeenCalledTimes(6);
    expect(rendered(commands.at(-1) as Command)).toStartWith('UPDATE events');
    expect(await redis.llen(REDIS_KEY)).toBe(0);
    expect(await redis.keys(`${REDIS_KEY}:views-done:*`)).toEqual([]);
  });

  it('retries the version probe after it failed once', async () => {
    const buffer = makeBuffer();
    await buffer.add(entry());
    chQuery.mockImplementationOnce(() =>
      Promise.reject(new Error('clickhouse restarting'))
    );

    await buffer.tryFlush({ trigger: 'cron' });
    expect(chCommand).not.toHaveBeenCalled();

    await buffer.tryFlush({ trigger: 'cron' });
    expect(chQuery).toHaveBeenCalledTimes(2);
    expect(chCommand).toHaveBeenCalledTimes(4);
    expect(await redis.llen(REDIS_KEY)).toBe(0);
  });

  it('keeps the batch when a statement fails and retries it on the next flush', async () => {
    const buffer = makeBuffer();
    await buffer.add(entry());
    chCommand.mockImplementationOnce(() =>
      Promise.reject(new Error('clickhouse down'))
    );

    await buffer.tryFlush({ trigger: 'cron' });
    expect(await redis.llen(REDIS_KEY)).toBe(1);

    await buffer.tryFlush({ trigger: 'cron' });
    expect(await redis.llen(REDIS_KEY)).toBe(0);
    expect(rendered(commands.at(-1) as Command)).toStartWith('UPDATE events');
  });
});
