import { SESSION_TIMEOUT_MS, sessionBuffer } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import { logger as baseLogger } from '@/utils/logger';
import {
  sessionEndsEnqueued,
  sessionsReaped,
  sessionsReaperOrphans,
} from '@/metrics';
import { enqueueSessionEndV2 } from '@/utils/session-handler';

const logger = baseLogger.child({ job: 'session-reaper' });

const PROJECTS_SET_KEY = 'session:projects';
const REAPER_BATCH_SIZE = Number.parseInt(
  process.env.SESSION_REAPER_BATCH_SIZE || '5000',
  10
);
// Wall-clock deadman: close sessions whose last *received* event is older
// than this. Single source of truth for "this session has ended", regardless
// of project traffic.
//
// Default 30min, matching SESSION_TIMEOUT_MS. With the 5-min reaper interval,
// max session_end latency is 30-35min after the last event.
//
// During a worker pause longer than this, sessions in flight will be split
// when the worker resumes. Bump via env if you expect long pauses, but
// remember that BullMQ jobId-dedup + the extension check in createSessionEnd
// already cover normal queue lag.
const WALLCLOCK_DEADMAN_MS = Number.parseInt(
  process.env.SESSION_REAPER_WALLCLOCK_DEADMAN_MS ||
    String(SESSION_TIMEOUT_MS),
  10
);
const LOCK_TTL_SECONDS = 60;

const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;
const lockKey = (projectId: string) => `session:reaper:lock:${projectId}`;

/**
 * Cron: scan every project with active sessions, close any whose last event
 * was received more than the deadman ago in wall-clock time.
 *
 * Idempotent — uses BullMQ jobId-dedup via enqueueSessionEndV2.
 */
export async function sessionReaperCronJob() {
  if (process.env.SESSION_REAPER === '0') {
    return;
  }

  const redis = getRedisCache();
  const projectIds = await redis.smembers(PROJECTS_SET_KEY);

  if (projectIds.length === 0) {
    return;
  }

  logger.debug({ projectCount: projectIds.length }, 'Reaper tick');

  let totalReaped = 0;
  let totalErrors = 0;

  for (const projectId of projectIds) {
    try {
      const reaped = await reapProject(projectId);
      totalReaped += reaped;
    } catch (error) {
      totalErrors++;
      logger.error({ err: error, projectId }, 'Failed to reap project');
    }
  }

  if (totalReaped > 0 || totalErrors > 0) {
    logger.info(
      { reaped: totalReaped, errors: totalErrors, projects: projectIds.length },
      'Reaper tick complete',
    );
  }
}

async function reapProject(projectId: string): Promise<number> {
  const redis = getRedisCache();

  // Per-project advisory lock keeps multiple worker pods from reaping the
  // same project simultaneously. Set NX with a short TTL; the lock is best
  // effort — if it expires mid-tick, BullMQ jobId-dedup is the real guard.
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
    const now = Date.now();
    const cutoff = now - WALLCLOCK_DEADMAN_MS;

    const candidates = await redis.zrangebyscore(
      wallclockSetKey(projectId),
      0,
      cutoff,
      'LIMIT',
      0,
      REAPER_BATCH_SIZE
    );

    let reaped = 0;
    for (const deviceId of candidates) {
      if (await closeSession(projectId, deviceId)) {
        reaped++;
      }
    }

    // If the project has no remaining sessions in the wallclock index,
    // remove it from the projects set so we stop iterating it.
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
  deviceId: string
): Promise<boolean> {
  const session = await sessionBuffer.getExistingSession({
    projectId,
    deviceId,
  });

  if (!session) {
    // Sorted-set entry exists but the blob is gone. Without a TTL on the
    // blob this should be rare — only happens if cleanup() partially
    // failed (worker crash mid-MULTI, network partition). Log + count it
    // and ZREM the orphan entry.
    sessionsReaperOrphans.inc({ reason: 'deadman' });
    baseLogger.warn(
      { projectId, deviceId },
      'Reaper found wallclock entry without blob — likely a partial cleanup failure',
    );
    await getRedisCache().zrem(wallclockSetKey(projectId), deviceId);
    return false;
  }

  try {
    await enqueueSessionEndV2({
      payload: {
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
      },
      closedSession: session,
    });

    sessionsReaped.inc({ reason: 'deadman' });
    sessionEndsEnqueued.inc({ source: 'reaper' });

    logger.debug(
      { sessionId: session.id, projectId, deviceId },
      'Enqueued session_end (reaped)',
    );
    return true;
  } catch (error) {
    logger.error(
      { err: error, sessionId: session.id, projectId, deviceId },
      'Failed to enqueue session_end during reap',
    );
    return false;
  }
}
