// Ported from apps/worker/src/jobs/cron.session-reaper.ts (M7-001).

import type { Logger } from '../../../logger';
import type { IServiceCreateEventPayload } from '../../event/event.service';
import type { IClickhouseSession } from '../session.service';
import {
  DEFAULT_SESSION_TIMEOUT_MS,
  PROJECTS_SET_KEY,
  wallclockSetKey,
} from './keys';
import type { SessionRuntime } from './runtime';
import {
  sessionEndsEnqueued,
  sessionsReaped,
  sessionsReaperOrphans,
} from './session.metrics';
import type { EnqueueSessionEndInput } from './session-end';

const DEFAULT_REAPER_BATCH_SIZE = 5000;
const LOCK_TTL_SECONDS = 60;

const lockKey = (projectId: string) => `session:reaper:lock:${projectId}`;

export interface SessionReaperDeps extends SessionRuntime {
  logger: Logger;
  enqueueSessionEnd(input: EnqueueSessionEndInput): Promise<unknown>;
}

/**
 * Cron: for every project with active sessions, close any whose last event
 * was *received* more than the wall-clock deadman ago. The deadman (default
 * SESSION_TIMEOUT_MS, 30min) is the single source of truth for "this session
 * has ended" regardless of project traffic; with the 5-min cadence, max
 * session_end latency is 30-35min after the last event. Idempotent through
 * the session_end jobId.
 */
export async function reapIdleSessions(deps: SessionReaperDeps): Promise<void> {
  if (!deps.config.session.reaperEnabled) {
    return;
  }

  const projectIds = await deps.redis.smembers(PROJECTS_SET_KEY);
  if (projectIds.length === 0) {
    return;
  }

  deps.logger.debug({ projectCount: projectIds.length }, 'Reaper tick');

  let totalReaped = 0;
  let totalErrors = 0;

  for (const projectId of projectIds) {
    try {
      totalReaped += await reapProject(projectId, deps);
    } catch (error) {
      totalErrors++;
      deps.logger.error({ err: error, projectId }, 'Failed to reap project');
    }
  }

  if (totalReaped > 0 || totalErrors > 0) {
    deps.logger.info(
      { reaped: totalReaped, errors: totalErrors, projects: projectIds.length },
      'Reaper tick complete'
    );
  }
}

async function reapProject(
  projectId: string,
  deps: SessionReaperDeps
): Promise<number> {
  const { redis } = deps;

  // Per-project advisory lock keeps multiple worker pods from reaping the
  // same project simultaneously. Best effort — if it expires mid-tick, the
  // jobId-dedup is the real guard.
  const locked = await redis.set(
    lockKey(projectId),
    '1',
    'EX',
    LOCK_TTL_SECONDS,
    'NX'
  );
  if (locked === null) {
    return 0;
  }

  try {
    const session = deps.config.session;
    const deadmanMs =
      session.reaperWallclockDeadmanMs ??
      session.timeoutMs ??
      DEFAULT_SESSION_TIMEOUT_MS;
    const cutoff = Date.now() - deadmanMs;
    const candidates = await redis.zrangebyscore(
      wallclockSetKey(projectId),
      0,
      cutoff,
      'LIMIT',
      0,
      session.reaperBatchSize ?? DEFAULT_REAPER_BATCH_SIZE
    );

    let reaped = 0;
    for (const deviceId of candidates) {
      if (await closeSession(projectId, deviceId, deps)) {
        reaped++;
      }
    }

    // Nothing left in the wallclock index: stop iterating this project.
    const remaining = await redis.zcard(wallclockSetKey(projectId));
    if (remaining === 0) {
      await redis.srem(PROJECTS_SET_KEY, projectId);
    }

    return reaped;
  } finally {
    await redis.del(lockKey(projectId));
  }
}

async function closeSession(
  projectId: string,
  deviceId: string,
  deps: SessionReaperDeps
): Promise<boolean> {
  const session = await deps.sessions.getExistingSession({
    projectId,
    deviceId,
  });

  if (!session) {
    // Sorted-set entry without a blob: a partially failed cleanup() (worker
    // crash mid-MULTI, network partition). Count it and drop the orphan.
    sessionsReaperOrphans.inc({ reason: 'deadman' });
    deps.logger.warn(
      { projectId, deviceId },
      'Reaper found wallclock entry without blob — likely a partial cleanup failure'
    );
    await deps.redis.zrem(wallclockSetKey(projectId), deviceId);
    return false;
  }

  try {
    await deps.enqueueSessionEnd({
      payload: sessionEndPayload(session),
      closedSession: session,
    });

    sessionsReaped.inc({ reason: 'deadman' });
    sessionEndsEnqueued.inc({ source: 'reaper' });

    deps.logger.debug(
      { sessionId: session.id, projectId, deviceId },
      'Enqueued session_end (reaped)'
    );
    return true;
  } catch (error) {
    deps.logger.error(
      { err: error, sessionId: session.id, projectId, deviceId },
      'Failed to enqueue session_end during reap'
    );
    return false;
  }
}

function sessionEndPayload(
  session: IClickhouseSession
): IServiceCreateEventPayload {
  return {
    projectId: session.project_id,
    deviceId: session.device_id,
    sessionId: session.id,
    profileId: session.profile_id ?? '',
    name: 'session_end',
    properties: {},
    groups: session.groups ?? [],
    createdAt: new Date(session.ended_at),
    duration: session.duration ?? 0,
    sdkName: '',
    sdkVersion: '',
    city: session.city ?? '',
    country: session.country ?? '',
    region: session.region ?? '',
    longitude: session.longitude ?? undefined,
    latitude: session.latitude ?? undefined,
    path: session.exit_path ?? '',
    origin: session.exit_origin ?? '',
    referrer: session.referrer ?? '',
    referrerName: session.referrer_name ?? '',
    referrerType: session.referrer_type ?? '',
    os: session.os ?? '',
    osVersion: session.os_version ?? '',
    browser: session.browser ?? '',
    browserVersion: session.browser_version ?? '',
    device: session.device ?? '',
    brand: session.brand ?? '',
    model: session.model ?? '',
  };
}
