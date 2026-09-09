// What the session lifecycle (session_end emission, reaper, vacuum) needs from
// the outside world, as narrow structural interfaces. The job handlers bind
// them to the scope's own clients with `sessionRuntimeFrom(ctx)`; the tests
// hand in stubs, so no `mock.module` is needed and every assertion is on a
// call the code under test made.

import type { CoreConfig } from '../../../config';
import type { Ctx } from '../../../context';
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
  /** The reaper's and vacuum's kill switches, batch sizes and thresholds. */
  config: CoreConfig;
}

/**
 * The two boot singletons the lifecycle needs, read off the work scope rather
 * than constructed here: `ctx.redis` and `ctx.buffers` are the same objects
 * main.ts built once, so a job handler no longer opens a connection of its
 * own and its writes stay inside the request's scope (ADR-007, ADR-018 R1).
 */
export function sessionRuntimeFrom(
  ctx: Pick<Ctx, 'redis' | 'buffers' | 'config'>
): SessionRuntime {
  return {
    redis: ctx.redis,
    sessions: ctx.buffers.session,
    config: ctx.config,
  };
}
