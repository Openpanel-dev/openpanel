import { SESSION_TIMEOUT_MS, sessionBuffer } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import { logger as baseLogger } from '@/utils/logger';
import { sessionEndsEnqueued, sessionsReaped } from '@/metrics';
import { enqueueSessionEndV2 } from '@/utils/session-handler';

const logger = baseLogger.child({ job: 'session-reaper' });

const PROJECTS_SET_KEY = 'session:projects';
const REAPER_BATCH_SIZE = Number.parseInt(
  process.env.SESSION_REAPER_BATCH_SIZE || '5000',
  10
);
// 24h deadman: close sessions whose host project has gone silent in event-time
// AND whose last wall-clock-received is older than this. Bounds Redis memory
// for projects that fall idle.
const WALLCLOCK_DEADMAN_MS = Number.parseInt(
  process.env.SESSION_REAPER_WALLCLOCK_DEADMAN_MS ||
    String(1000 * 60 * 60 * 24),
  10
);
const LOCK_TTL_SECONDS = 60;

const activeSetKey = (projectId: string) => `session:active:${projectId}`;
const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;
const sessionKey = (projectId: string, deviceId: string) =>
  `session:${projectId}:${deviceId}`;
const hwmKey = (projectId: string) => `session:hwm:${projectId}`;
const lockKey = (projectId: string) => `session:reaper:lock:${projectId}`;

/**
 * Cron: scan every project with active sessions, close any whose last event
 * is older than the timeout in event-time (HWM-based) or older than the
 * 24h wall-clock deadman.
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
    const hwmRaw = await redis.get(hwmKey(projectId));
    const now = Date.now();
    let reaped = 0;

    // 1. Event-time reap: close sessions whose last event is more than
    // SESSION_TIMEOUT_MS behind the project's high-water mark.
    if (hwmRaw) {
      const hwm = Number.parseInt(hwmRaw, 10);
      if (Number.isFinite(hwm)) {
        const threshold = hwm - SESSION_TIMEOUT_MS;
        const candidates = await redis.zrangebyscore(
          activeSetKey(projectId),
          0,
          threshold,
          'LIMIT',
          0,
          REAPER_BATCH_SIZE
        );
        for (const deviceId of candidates) {
          if (await closeSession(projectId, deviceId, 'event-time')) {
            reaped++;
          }
        }
      }
    }

    // 2. Wall-clock deadman: catches sessions in projects whose HWM never
    // advances (low/zero traffic). Bounds memory.
    const deadmanCutoff = now - WALLCLOCK_DEADMAN_MS;
    const stragglers = await redis.zrangebyscore(
      wallclockSetKey(projectId),
      0,
      deadmanCutoff,
      'LIMIT',
      0,
      REAPER_BATCH_SIZE
    );
    for (const deviceId of stragglers) {
      if (await closeSession(projectId, deviceId, 'deadman')) {
        reaped++;
      }
    }

    // 3. House-keeping: if the project has no active sessions anymore,
    // remove it from the projects set so the reaper stops iterating it.
    const remaining = await redis.zcard(activeSetKey(projectId));
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
  reason: 'event-time' | 'deadman'
): Promise<boolean> {
  const session = await sessionBuffer.getExistingSession({
    projectId,
    deviceId,
  });

  if (!session) {
    // Already cleaned up (e.g., session_end ran from another path). Drop
    // from the sorted sets to keep them tidy.
    const redis = getRedisCache();
    const multi = redis.multi();
    multi.zrem(activeSetKey(projectId), deviceId);
    multi.zrem(wallclockSetKey(projectId), deviceId);
    await multi.exec();
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

    sessionsReaped.inc({ reason });
    sessionEndsEnqueued.inc({ source: 'reaper' });

    logger.debug(
      { sessionId: session.id, projectId, deviceId, reason },
      'Enqueued session_end (reaped)',
    );
    return true;
  } catch (error) {
    logger.error(
      { err: error, sessionId: session.id, projectId, deviceId, reason },
      'Failed to enqueue session_end during reap',
    );
    return false;
  }
}
