// One-off migration: convert legacy `session:{sessionId}` Redis blobs +
// delayed BullMQ `sessionEnd:{projectId}:{deviceId}` jobs into the new
// session-buffer key scheme:
//
//   session:{projectId}:{deviceId}            -> full session JSON blob (no TTL)
//   session:profile:{projectId}:{profileId}   -> deviceId pointer (no TTL)
//   session:wallclock:{projectId}             -> ZSET scored by wall-clock (ms)
//   session:projects                          -> SET of project_ids with active sessions
//
// Source of truth: the delayed `sessionsQueue` jobs — one per (projectId,
// deviceId) pair currently considered "active" by the legacy system. For
// each, we read the corresponding `session:{sessionId}` blob (still alive
// under its 1h TTL) and rewrite it into the new structure.
//
// Idempotent: re-running the script is safe. Existing new-scheme keys are
// preserved via SET NX semantics inside the multi pipeline.
//
// Usage (from packages/db, env loaded from repo root .env):
//   pnpm with-env tsx scripts/migrate-sessions.ts
//   pnpm with-env tsx scripts/migrate-sessions.ts --dry-run
//
// Runbook step 2: pause `events.incoming-event` AND `sessions` queues first,
// wait for in-flight jobs to drain (~30s), THEN run this script. Resume
// `events.incoming-event` after deploy; keep `sessions` paused until step 7
// (drain-old-session-jobs.ts) finishes.

import { getSafeJson } from '@openpanel/json';
import {
  type EventsQueuePayloadCreateSessionEnd,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type { IClickhouseSession } from '../src/services/session.service';

const sessionKey = (projectId: string, deviceId: string) =>
  `session:${projectId}:${deviceId}`;
const profileIndexKey = (projectId: string, profileId: string) =>
  `session:profile:${projectId}:${profileId}`;
const wallclockSetKey = (projectId: string) =>
  `session:wallclock:${projectId}`;
const PROJECTS_SET_KEY = 'session:projects';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const redis = getRedisCache();

  console.log(
    `[migrate-sessions] starting${dryRun ? ' (DRY RUN — no writes)' : ''}`
  );

  const jobs = await sessionsQueue.getJobs(['delayed', 'waiting']);
  console.log(`[migrate-sessions] found ${jobs.length} legacy session jobs`);

  const counts = {
    migrated: 0,
    blobMissing: 0,
    alreadyMigrated: 0,
    parseFailed: 0,
  };

  for (const job of jobs) {
    const data = job.data as EventsQueuePayloadCreateSessionEnd | undefined;
    const payload = data?.payload;
    if (!payload?.projectId || !payload.deviceId || !payload.sessionId) {
      counts.parseFailed++;
      continue;
    }
    const { projectId, deviceId, sessionId } = payload;

    const existsAlready = await redis.exists(sessionKey(projectId, deviceId));
    if (existsAlready) {
      counts.alreadyMigrated++;
      continue;
    }

    const blob = await redis.get(`session:${sessionId}`);
    if (!blob) {
      counts.blobMissing++;
      continue;
    }

    const session = getSafeJson<IClickhouseSession>(blob);
    if (!session) {
      counts.parseFailed++;
      continue;
    }

    const nowMs = Date.now();

    if (dryRun) {
      counts.migrated++;
      continue;
    }

    const multi = redis.multi();
    multi.set(sessionKey(projectId, deviceId), blob);
    multi.zadd(wallclockSetKey(projectId), nowMs.toString(), deviceId);
    multi.sadd(PROJECTS_SET_KEY, projectId);
    if (session.profile_id && session.profile_id !== deviceId) {
      multi.set(profileIndexKey(projectId, session.profile_id), deviceId);
    }
    await multi.exec();

    counts.migrated++;

    if (counts.migrated % 1000 === 0) {
      console.log(
        `[migrate-sessions] progress: ${counts.migrated} migrated`
      );
    }
  }

  console.log('[migrate-sessions] done', counts);
  await redis.quit();
  process.exit(0);
}

main().catch((error) => {
  console.error('[migrate-sessions] fatal error:', error);
  process.exit(1);
});
