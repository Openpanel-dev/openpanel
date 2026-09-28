// Ported from apps/worker/src/jobs/cron.session-vacuum.ts.

import type { Logger } from '../../../logger';
import { PROJECTS_SET_KEY, wallclockSetKey } from './keys';
import type { SessionRuntime } from './runtime';
import { sessionsVacuumed } from './session.metrics';

const DEFAULT_VACUUM_BATCH_SIZE = 1000;
// Much larger than the reaper deadman, so it never races with normal reaping.
const DEFAULT_VACUUM_STALE_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7;

export interface SessionVacuumDeps extends SessionRuntime {
  logger: Logger;
}

/**
 * Daily backstop for the rare case where `cleanup()` did not fully delete a
 * session (worker crash mid-MULTI, Redis partition). Wallclock entries older
 * than the stale threshold are either cleaned up (blob still there, id-gated)
 * or dropped (blob gone). Both paths count in `sessions_vacuumed_total`, so a
 * persistent non-zero value surfaces a deeper issue.
 */
export async function vacuumStaleSessions(
  deps: SessionVacuumDeps
): Promise<void> {
  if (!deps.config.session.vacuumEnabled) {
    return;
  }

  const { redis, sessions, logger, config } = deps;
  const projectIds = await redis.smembers(PROJECTS_SET_KEY);
  if (projectIds.length === 0) {
    return;
  }

  logger.info({ projectCount: projectIds.length }, 'Vacuum tick starting');

  const cutoff =
    Date.now() -
    (config.session.vacuumStaleThresholdMs ??
      DEFAULT_VACUUM_STALE_THRESHOLD_MS);
  const batchSize = config.session.vacuumBatchSize ?? DEFAULT_VACUUM_BATCH_SIZE;
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
        batchSize
      );

      for (const deviceId of candidates) {
        const session = await sessions.getExistingSession({
          projectId,
          deviceId,
        });

        if (session) {
          await sessions.cleanup({
            projectId,
            deviceId,
            sessionId: session.id,
            profileId: session.profile_id,
          });
          sessionsVacuumed.inc({ reason: 'stale_blob' });
          staleBlobs++;
        } else {
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
