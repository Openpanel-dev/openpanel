// Stubs for the lifecycle tests (session-end, reaper, vacuum): typed against
// the structural deps in runtime.ts, so the code under test is exercised for
// real and every assertion is on a call it made — no `mock.module`.

import { mock } from 'bun:test';
import type { Logger } from '../../../logger';
import type { IClickhouseSession } from '../session.service';
import type { SessionRedis, SessionStore } from './runtime';

export function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

export type StubRedis = { [K in keyof SessionRedis]: ReturnType<typeof mock> };

/** Lock/claim acquired, one project, nothing idle — override per test. */
export function stubRedis(): StubRedis {
  return {
    set: mock(async () => 'OK'),
    smembers: mock(async () => ['proj-1']),
    srem: mock(async () => 1),
    zrangebyscore: mock(async () => []),
    zcard: mock(async () => 0),
    zrem: mock(async () => 1),
    del: mock(async () => 1),
  };
}

export type StubStore = {
  [K in keyof SessionStore]: ReturnType<typeof mock>;
};

export function stubStore(live: IClickhouseSession | null = null): StubStore {
  return {
    getExistingSession: mock(async () => live),
    cleanup: mock(async () => undefined),
  };
}

export function fixtureSession(
  overrides: Partial<IClickhouseSession> = {}
): IClickhouseSession {
  return {
    id: 'sess-1',
    project_id: 'proj-1',
    device_id: 'dev-1',
    profile_id: 'dev-1',
    created_at: '2026-06-08 10:30:00',
    ended_at: '2026-06-08 11:00:00',
    is_bounce: false,
    duration: 1_800_000,
    event_count: 3,
    screen_view_count: 5,
    exit_path: '/end',
    groups: [],
    ...overrides,
  } as unknown as IClickhouseSession;
}
