// What the session lifecycle (session_end emission, reaper, vacuum) needs from
// the outside world, as narrow structural interfaces. The job handlers bind
// them to the real @openpanel/db buffers and @openpanel/redis client through
// `loadSessionRuntime` (lazily — see session.service.ts's header); the tests
// hand in stubs, so no `mock.module` is needed and every assertion is on a
// call the code under test made.

import { loadDbBuffers } from '../../../buffers/lazy-db-buffers';
import type { IClickhouseSession } from '../session.service';

export interface SessionStore {
  getExistingSession(input: {
    projectId: string;
    deviceId: string;
  }): Promise<IClickhouseSession | null>;
  /** Id-gated: a no-op when another session already owns the slot. */
  cleanup(input: {
    projectId: string;
    deviceId: string;
    sessionId: string;
    profileId?: string | null;
  }): Promise<void>;
}

/** The ioredis subset the lifecycle touches. */
export interface SessionRedis {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
    condition: 'NX'
  ): Promise<'OK' | null>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<number>;
  zrangebyscore(
    key: string,
    min: number,
    max: number,
    limitToken: 'LIMIT',
    offset: number,
    count: number
  ): Promise<string[]>;
  zcard(key: string): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  del(key: string): Promise<number>;
}

export interface SessionRuntime {
  redis: SessionRedis;
  sessions: SessionStore;
}

export async function loadSessionRuntime(): Promise<SessionRuntime> {
  const [{ getRedisCache }, { sessionBuffer }] = await Promise.all([
    import('@openpanel/redis'),
    loadDbBuffers(),
  ]);
  return { redis: getRedisCache(), sessions: sessionBuffer };
}
