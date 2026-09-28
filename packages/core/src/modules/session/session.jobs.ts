// Schedules moved onto the jobs at ADR-021.
//
// `sessions` is this module's own queue — registry key and Redis name
// `sessions`, job name `session`, `removeOnComplete: true`, concurrency 1, all
// V1's (jobs.registry.ts). Its wire payload is `{ event, snapshot }`, which is
// what `legacyCompat.sessions` maps V1's `{type:'createSessionEnd', payload,
// snapshot}` onto. `flushSessions` / `flushReplay` / `sessionReaper` /
// `sessionVacuum` are cron fragments, spread into the ONE `cron` queue by
// jobs.registry.ts, ids and cadences unchanged (apps/worker/src/boot-cron.ts).
//
// Every handler reads its clients off `ctx` — the buffers and the Redis
// connection main.ts built once, and the ClickHouse client the job's own
// requestId is bound to.

import { z } from 'zod';
import { chQuery } from '../../ch-query';
import type { Ctx } from '../../context';
import { defineJob } from '../../jobs/define';
import type { Logger } from '../../logger';
import {
  createEvent,
  type IClickhouseEvent,
  transformEvent,
  transformSessionToEvent,
} from '../event/event.service';
import { sessionRuntimeFrom } from './src/runtime';
import {
  createSessionEnd,
  type SessionEndDeps,
  type SessionEndJobData,
  type SessionEndJobWire,
} from './src/session-end';
import { reapIdleSessions } from './src/session-reaper';
import { vacuumStaleSessions } from './src/session-vacuum';
import { updateEventsCount } from './src/usage';

const MINUTE_MS = 60 * 1000;
const SESSION_REAPER_INTERVAL_MS = 5 * MINUTE_MS;
/** Daily 04:00 UTC — backstop for cleanup leaks. */
const SESSION_VACUUM_CRON = '0 4 * * *';
const FLUSH_SESSIONS_INTERVAL_MS = 10_000;
const FLUSH_REPLAY_INTERVAL_MS = 10_000;

// Wire-shape check only — V1 never validated it either (see
// jobs/compat.test.ts), and tightening it now would reject payloads the running
// system accepts.
//
// The schema's INPUT is what the producer holds (`SessionEndJobData`, a real
// `Date` on `event.createdAt`) and its OUTPUT is what a handler is actually
// handed after BullMQ's JSON round-trip (`SessionEndJobWire`, a string there).
// `PayloadOf` reads the input and the handler reads the output, so the two stay
// honest without either side casting. The transform is a type seam only — it
// returns the value it was given.
const sessionEndWireShape = z.object({
  event: z.object({ projectId: z.string(), deviceId: z.string() }),
  snapshot: z.object({
    id: z.string(),
    project_id: z.string(),
    device_id: z.string(),
    ended_at: z.string(),
  }),
});

const sessionEndPayload = z
  .custom<SessionEndJobData>(
    (value) => sessionEndWireShape.safeParse(value).success
  )
  .transform((value) => value as unknown as SessionEndJobWire);

/**
 * The session-end job's dependencies, bound to the run's own ctx.
 *
 * Two lookups stay dynamic, both for the same reason now that
 * notification-dispatch.ts has moved into core: keeping notification.service.ts
 * — and the dispatch module built on it — out of jobs.registry.ts's eager
 * import graph, which every core test file walks.
 */
async function sessionEndDeps(
  ctx: Ctx,
  logger: Logger
): Promise<SessionEndDeps> {
  const [notifications, { checkNotificationRulesForSessionEnd }] =
    await Promise.all([
      import('../notification/notification.service'),
      import('../notification/src/notification-dispatch'),
    ]);

  return {
    ...sessionRuntimeFrom(ctx),
    logger,
    createEvent: (payload) => createEvent(ctx, payload),
    transformEvent,
    transformSessionToEvent,
    getEvents: async (query) =>
      (await chQuery<IClickhouseEvent>(ctx, query)).map(transformEvent),
    profileBackfill: ctx.buffers.profileBackfill,
    notifications: {
      getRules: (projectId) =>
        notifications.getNotificationRulesByProjectId(ctx, projectId),
      hasFunnelRules: notifications.getHasFunnelRules,
      checkFunnelRules: (events) =>
        checkNotificationRulesForSessionEnd(ctx, events),
    },
  };
}

/** The `sessions` queue's own job. */
export const sessionQueueJobs = {
  session: defineJob({
    payload: sessionEndPayload,
    handler: async ({ payload: data, ctx }) => {
      const logger = ctx.logger.child({ payload: data.event });

      await createSessionEnd(data, await sessionEndDeps(ctx, logger));

      try {
        await updateEventsCount(ctx, data.event.projectId);
      } catch (error) {
        logger.error({ err: error }, 'Failed to update events count');
      }
    },
  }),
};

/** This module's fragment of the `cron` queue's jobs. */
export const sessionCronJobs = {
  flushSessions: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_SESSIONS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.session.tryFlush({ trigger: 'cron' });
    },
  }),
  // Session replay chunks are ingested onto this module's session id, so the
  // replay buffer (Redis → ClickHouse `session_replay_chunks`) flushes here
  // too, next to the sessions it belongs to.
  flushReplay: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_REPLAY_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.replay.tryFlush({ trigger: 'cron' });
    },
  }),
  sessionReaper: defineJob({
    payload: z.null(),
    cron: { every: SESSION_REAPER_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await reapIdleSessions({
        ...sessionRuntimeFrom(ctx),
        logger: ctx.logger.child({ job: 'session-reaper' }),
        enqueueSessionEnd: (input) =>
          ctx.services.session.enqueueSessionEnd(input),
      });
    },
  }),
  sessionVacuum: defineJob({
    payload: z.null(),
    cron: { pattern: SESSION_VACUUM_CRON },
    handler: async ({ ctx }) => {
      await vacuumStaleSessions({
        ...sessionRuntimeFrom(ctx),
        logger: ctx.logger.child({ job: 'session-vacuum' }),
      });
    },
  }),
};
