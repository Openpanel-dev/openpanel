import { sessionBuffer } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import { logger as baseLogger } from '@/utils/logger';
import { sessionsVacuumed } from '@/metrics';

const logger = baseLogger.child({ job: 'session-vacuum' });

const PROJECTS_SET_KEY = 'session:projects';
const VACUUM_BATCH_SIZE = Number.parseInt(
  process.env.SESSION_VACUUM_BATCH_SIZE || '1000',
  10
);
// Anything in the wallclock index that hasn't moved in this long is stale —
// either a leaked entry (cleanup() partially failed) or a session that's
// been forgotten by every code path. Much larger than the reaper deadman
// so it never races with normal reap timing.
const VACUUM_STALE_THRESHOLD_MS = Number.parseInt(
  process.env.SESSION_VACUUM_STALE_THRESHOLD_MS ||
    String(1000 * 60 * 60 * 24 * 7), // 7 days
  10
);

const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;

/**
 * Daily backstop for the rare case where `cleanup()` fails to fully delete
 * a session (worker crash mid-MULTI, Redis partition). Scans each project's
 * wallclock index for entries older than the stale threshold and:
 *
 *  - If the blob still exists → run cleanup() (id-gated, atomic via Lua)
 *  - If the blob is gone      → ZREM the orphan entry
 *
 * Both paths increment `sessions_vacuumed_total` with a reason label, so
 * persistent non-zero values surface deeper issues.
 */
export async function sessionVacuumCronJob() {
  if (process.env.SESSION_VACUUM === '0') {
    return;
  }

  const redis = getRedisCache();
  const projectIds = await redis.smembers(PROJECTS_SET_KEY);

  if (projectIds.length === 0) {
    return;
  }

  logger.info({ projectCount: projectIds.length }, 'Vacuum tick starting');

  const cutoff = Date.now() - VACUUM_STALE_THRESHOLD_MS;
  let total = 0;
  let staleBlobs = 0;
  let missingBlobs = 0;

  for (const projectId of projectIds) {
    try {
      const candidates = await redis.zrangebyscore(
        wallclockSetKey(projectId),
        0,
        cutoff,
        'LIMIT',
        0,
        VACUUM_BATCH_SIZE
      );

      for (const deviceId of candidates) {
        const session = await sessionBuffer.getExistingSession({
          projectId,
          deviceId,
        });

        if (session) {
          // Blob still exists but is ancient — cleanup leaked. Use the
          // id-gated cleanup so we don't race with a fresh session that
          // happens to occupy the same slot.
          await sessionBuffer.cleanup({
            projectId,
            deviceId,
            sessionId: session.id,
            profileId: session.profile_id,
          });
          sessionsVacuumed.inc({ reason: 'stale_blob' });
          staleBlobs++;
        } else {
          // Orphan: blob is gone, wallclock entry left behind.
          await redis.zrem(wallclockSetKey(projectId), deviceId);
          sessionsVacuumed.inc({ reason: 'missing_blob' });
          missingBlobs++;
        }
        total++;
      }
    } catch (error) {
      logger.error({ err: error, projectId }, 'Vacuum failed for project');
    }
  }

  if (total > 0) {
    logger.info({ total, staleBlobs, missingBlobs }, 'Vacuum tick complete');
  }
}
