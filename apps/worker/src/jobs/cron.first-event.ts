import { ch, chQuery, TABLE_NAMES } from '@openpanel/db';
import { getLock } from '@openpanel/redis';

import { logger } from '../utils/logger';

// dashreels only for now — shortreels' Jun-10+ backlog isn't loaded yet, so running
// the cron for it would emit _first_event with late timestamps for backlog devices.
// Add 'shortreels' here once its backlog is backfilled.
const PROJECT_IDS = ['dashreels'];
const BATCH_SIZE = 10_000;
// Per-device infra (migration 19). device_first_seen is the candidate list
// (one row/device, fed by device_first_seen_mv at insert); first_event_dedup_device
// is the guard (one row/device that already has a _first_event, fed by its MV).
const SOURCE_TABLE = 'device_first_seen';
const DEDUP_TABLE = 'first_event_dedup_device';
const LOOKBACK_DAYS = 7;

type Candidate = {
  device_id: string;
  project_id: string;
  profile_id: string;
  session_id: string;
  first_ts: string;
};

export async function firstEvent() {
  const lock = await getLock('firstEvent:lock', '1', 55 * 60 * 1000);
  if (!lock) {
    logger.info('[first-event] Skipping — another instance is already running');
    return;
  }

  try {
    const projectList = PROJECT_IDS.map((p) => `'${p}'`).join(', ');

    // Per-device: each deviceUID's first-seen time + install profile from
    // device_first_seen, bounded to the last LOOKBACK_DAYS (keeps the scan cheap
    // and drops stale/late-arriving edge cases), anti-joined against the guard so
    // any device that already has a _first_event is skipped. Emitting then feeds
    // the guard (via first_event_dedup_device_mv), so a device is processed once.
    const candidates = await chQuery<Candidate>(`
      SELECT
        candidates.deviceUID AS device_id,
        candidates.project_id,
        candidates.install_profile AS profile_id,
        candidates.install_session AS session_id,
        toString(candidates.first_ts) AS first_ts
      FROM (
        SELECT
          project_id,
          deviceUID,
          minMerge(first_ts) AS first_ts,
          argMinMerge(install_profile) AS install_profile,
          argMinMerge(install_session) AS install_session
        FROM ${SOURCE_TABLE}
        WHERE project_id IN (${projectList})
        GROUP BY project_id, deviceUID
        HAVING first_ts >= now() - INTERVAL ${LOOKBACK_DAYS} DAY
      ) AS candidates
      LEFT ANTI JOIN ${DEDUP_TABLE} AS d
        ON candidates.project_id = d.project_id
        AND candidates.deviceUID = d.deviceUID
      SETTINGS max_execution_time = 60
    `);

    if (candidates.length === 0) {
      logger.info('[first-event] No new devices to process');
      return;
    }

    logger.info(`[first-event] Found ${candidates.length} devices to insert`);

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);

      await ch.insert({
        table: TABLE_NAMES.events,
        values: batch.map((c) => ({
          name: '_first_event',
          // Anon install profile — resolved to canonical at read via profile_aliases.
          profile_id: c.profile_id,
          // device_id carries the deviceUID (matches the backfill), so the dedup MV
          // and every per-device funnel key on it.
          device_id: c.device_id,
          project_id: c.project_id,
          session_id: c.session_id,
          created_at: c.first_ts,
          // properties is a Map column — pass a raw object, NOT JSON.stringify
          // (a stringified value serializes as "{...}" and CH rejects it).
          properties: {
            deviceUID: c.device_id,
            is_synthetic: 'true',
          },
          os: '',
          os_version: '',
          country: '',
          city: '',
          region: '',
          device: '',
          brand: '',
          model: '',
          sdk_name: 'cron',
          sdk_version: '1.0.0',
        })),
        format: 'JSONEachRow',
      });

      logger.info(
        `[first-event] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(candidates.length / BATCH_SIZE)}`,
      );
    }

    logger.info(
      `[first-event] Done — inserted _first_event for ${candidates.length} devices`,
    );
  } catch (error) {
    logger.error('[first-event] Error:', error);
    throw error;
  }
}
