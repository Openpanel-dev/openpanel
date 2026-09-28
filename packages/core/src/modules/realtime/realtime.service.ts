// The realtime queries plus the `/live` websocket glue:
// `getActiveVisitorCount` and the four `subscribeToPublishedEvent` calls,
// filtered by projectId.
//
// `TABLE_NAMES` and the date helpers come from core's own pure copies
// (shared/ch-tables.ts, shared/ch-dates.ts) rather than @openpanel/db, which
// is what lets the import stay static: db's clickhouse/client.ts constructs a
// real client and a pino transport at module load.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import {
  type IPublishChannels,
  subscribeToPublishedEvent,
} from '@openpanel/redis';
import { subMinutes } from 'date-fns';
import { chQuery } from '../../ch-query';
import type { ServiceDeps, Services } from '../../services';
import {
  convertClickhouseDateToJs,
  formatClickhouseDate,
} from '../../shared/ch-dates';
import { TABLE_NAMES } from '../../shared/ch-tables';
import { type IClickhouseEvent, transformEvent } from '../event/event.service';
import { getProfiles } from '../profile/profile.service';

const REALTIME_WINDOW_MINUTES = 30;
const ACTIVE_SESSIONS_LIMIT = 50;
const PATHS_LIMIT = 50;
const REFERRALS_LIMIT = 50;
const GEO_LIMIT = 50;
const COORDINATES_QUERY_LIMIT = 5000;
const COORDINATES_CLUSTER_TARGET = 500;
const MAP_BADGE_TOP_LIMIT = 3;
const MAP_BADGE_RECENT_SESSIONS_LIMIT = 8;
const CLUSTER_RADII_DEGREES = [0.5, 1, 3, 10];
/** Decimal places both sides of the coordinate tuple comparison agree on; the
 *  `toDecimal64(..., 4)` scale in the SQL below must stay equal to it. */
const COORDINATE_DECIMALS = 4;
const EXCLUDED_BADGE_EVENT_NAMES = [
  'screen_view',
  'session_start',
  'session_end',
];
// clix built these queries with no timezone argument, and `clix(client)`
// defaults to `'UTC'` (query-builder.ts:696), sending it as
// `clickhouse_settings.session_timezone` on every `execute()`. The seven
// statements that came off clix keep sending it so their result sets stay
// identical; the three that were already raw `chQuery` calls sent no
// `session_timezone` and still send none.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;

function since(): Date {
  return subMinutes(new Date(), REALTIME_WINDOW_MINUTES);
}

export interface RealtimeLocation {
  country?: string;
  city?: string;
  lat?: number;
  long?: number;
}

export type RealtimeBadgeDetailScope =
  | 'country'
  | 'city'
  | 'coordinate'
  | 'merged';

interface CoordinatePoint {
  country: string;
  city: string;
  long: number;
  lat: number;
  count: number;
}

function mergeByRadius(
  points: CoordinatePoint[],
  radius: number
): CoordinatePoint[] {
  // Highest-count points become cluster centers; nearby points get absorbed into them
  const sorted = [...points].sort((a, b) => b.count - a.count);
  const absorbed = new Uint8Array(sorted.length);
  const clusters: CoordinatePoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (absorbed[i]) {
      continue;
    }
    const seed = sorted[i];
    if (!seed) {
      continue;
    }
    const center: CoordinatePoint = { ...seed };
    for (let j = i + 1; j < sorted.length; j++) {
      if (absorbed[j]) {
        continue;
      }
      const other = sorted[j];
      if (!other) {
        continue;
      }
      const dlat = other.lat - center.lat;
      const dlong = other.long - center.long;
      if (Math.sqrt(dlat * dlat + dlong * dlong) <= radius) {
        center.count += other.count;
        absorbed[j] = 1;
      }
    }
    clusters.push(center);
  }

  return clusters;
}

function adaptiveCluster(
  points: CoordinatePoint[],
  target: number
): CoordinatePoint[] {
  if (points.length <= target) {
    return points;
  }

  // Expand merge radius until we hit the target (~55km → ~111km → ~333km → ~1110km)
  for (const radius of CLUSTER_RADII_DEGREES) {
    const clustered = mergeByRadius(points, radius);
    if (clustered.length <= target) {
      return clustered;
    }
  }

  return points.slice(0, target);
}

// --- location filters ------------------------------------------------------
//
// V1 built these as escaped SQL text and spliced them into five statements
// (clix `.rawWhere()` four times, one raw template). They are fragments now,
// so the same fragment object composes into every statement and each one
// numbers its own params at `toStatement()`.

function coordinateTuples(locations: RealtimeLocation[]): SqlFragment[] {
  return locations
    .filter(
      (
        location
      ): location is RealtimeLocation & { lat: number; long: number } =>
        typeof location.lat === 'number' && typeof location.long === 'number'
    )
    .map(
      (location) =>
        sql`(${sql.string(location.country ?? '')}, ${sql.string(
          location.city ?? ''
        )}, toDecimal64(${sql.string(location.long.toFixed(COORDINATE_DECIMALS))}, 4), toDecimal64(${sql.string(location.lat.toFixed(COORDINATE_DECIMALS))}, 4))`
    );
}

function buildRealtimeLocationFilter(
  locations: RealtimeLocation[]
): SqlFragment {
  const tuples = coordinateTuples(locations);

  if (tuples.length === 0) {
    return buildRealtimeCityFilter(locations);
  }

  return sql`(coalesce(country, ''), coalesce(city, ''), toDecimal64(longitude, 4), toDecimal64(latitude, 4)) IN (${sql.join(tuples)})`;
}

function buildRealtimeCountryFilter(
  locations: RealtimeLocation[]
): SqlFragment {
  const countries = [
    ...new Set(locations.map((location) => location.country ?? '')),
  ];

  return sql`coalesce(country, '') IN ${sql.array('String', countries)}`;
}

/** V1 de-duplicated the rendered `('<country>', '<city>')` text; the pair it
 *  rendered from is the same key, so this de-duplicates on the pair. */
function cityTuples(locations: RealtimeLocation[]): SqlFragment[] {
  const seen = new Set<string>();
  const tuples: SqlFragment[] = [];

  for (const location of locations) {
    const country = location.country ?? '';
    const city = location.city ?? '';
    const key = JSON.stringify([country, city]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tuples.push(sql`(${sql.string(country)}, ${sql.string(city)})`);
  }

  return tuples;
}

function buildRealtimeCityFilter(locations: RealtimeLocation[]): SqlFragment {
  const tuples = cityTuples(locations);

  if (tuples.length === 0) {
    return buildRealtimeCountryFilter(locations);
  }

  return sql`(coalesce(country, ''), coalesce(city, '')) IN (${sql.join(tuples)})`;
}

function buildRealtimeBadgeDetailsFilter(input: {
  detailScope: RealtimeBadgeDetailScope;
  locations: RealtimeLocation[];
}): SqlFragment {
  if (input.detailScope === 'country') {
    return buildRealtimeCountryFilter(input.locations);
  }

  if (input.detailScope === 'city') {
    return buildRealtimeCityFilter(input.locations);
  }

  if (input.detailScope === 'merged') {
    return buildRealtimeCityFilter(input.locations);
  }

  return buildRealtimeLocationFilter(input.locations);
}

export async function getRealtimeCoordinates(
  deps: ServiceDeps,
  projectId: string
) {
  const res = await chQuery<CoordinatePoint>(
    deps,
    sql`SELECT
      country,
      city,
      longitude as long,
      latitude as lat,
      COUNT(DISTINCT session_id) as count
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= now() - INTERVAL ${sql.uint64(REALTIME_WINDOW_MINUTES)} MINUTE
      AND longitude IS NOT NULL
      AND latitude IS NOT NULL
    GROUP BY country, city, longitude, latitude
    ORDER BY count DESC
    LIMIT ${sql.uint64(COORDINATES_QUERY_LIMIT)}`
  );

  return adaptiveCluster(res, COORDINATES_CLUSTER_TARGET);
}

export async function getRealtimeMapBadgeDetails(
  deps: ServiceDeps,
  input: {
    projectId: string;
    detailScope: RealtimeBadgeDetailScope;
    locations: RealtimeLocation[];
  }
) {
  const sinceDate = formatClickhouseDate(since());
  const locationFilter = buildRealtimeBadgeDetailsFilter(input);
  const projectIdParam = sql.string(input.projectId);
  const sinceParam = sql.string(sinceDate);
  const events = sql.id(TABLE_NAMES.events);

  const summaryQuery = sql`SELECT COUNT(DISTINCT session_id) as total_sessions, COUNT(DISTINCT nullIf(profile_id, '')) as total_profiles FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND ${locationFilter}`;

  const topReferrersQuery = sql`SELECT referrer_name, COUNT(DISTINCT session_id) as count FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND referrer_name != ${sql.string('')} AND ${locationFilter} GROUP BY referrer_name ORDER BY count DESC LIMIT ${sql.uint64(MAP_BADGE_TOP_LIMIT)}`;

  const topPathsQuery = sql`SELECT origin, path, COUNT(DISTINCT session_id) as count FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND path != ${sql.string('')} AND ${locationFilter} GROUP BY origin, path ORDER BY count DESC LIMIT ${sql.uint64(MAP_BADGE_TOP_LIMIT)}`;

  const topEventsQuery = sql`SELECT name, COUNT(DISTINCT session_id) as count FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND name NOT IN ${sql.array('String', EXCLUDED_BADGE_EVENT_NAMES)} AND ${locationFilter} GROUP BY name ORDER BY count DESC LIMIT ${sql.uint64(MAP_BADGE_TOP_LIMIT)}`;

  const [summary, topReferrers, topPaths, topEvents, recentSessions] =
    await Promise.all([
      chQuery<{
        total_sessions: number;
        total_profiles: number;
      }>(deps, summaryQuery, CLIX_SESSION_TIMEZONE),
      chQuery<{
        referrer_name: string;
        count: number;
      }>(deps, topReferrersQuery, CLIX_SESSION_TIMEZONE),
      chQuery<{
        origin: string;
        path: string;
        count: number;
      }>(deps, topPathsQuery, CLIX_SESSION_TIMEZONE),
      chQuery<{
        name: string;
        count: number;
      }>(deps, topEventsQuery, CLIX_SESSION_TIMEZONE),
      chQuery<{
        profile_id: string;
        session_id: string;
        created_at: string;
        path: string;
        name: string;
        country: string;
        city: string;
      }>(
        deps,
        sql`SELECT
          session_id,
          profile_id,
          created_at,
          path,
          name,
          country,
          city
        FROM (
          SELECT
            session_id,
            profile_id,
            created_at,
            path,
            name,
            country,
            city,
            row_number() OVER (
              PARTITION BY session_id ORDER BY created_at DESC
            ) AS rn
          FROM ${events}
          WHERE project_id = ${projectIdParam}
            AND created_at >= ${sinceParam}
            AND (${locationFilter})
        ) AS latest_event_per_session
        WHERE rn = 1
        ORDER BY created_at DESC
        LIMIT ${sql.uint64(MAP_BADGE_RECENT_SESSIONS_LIMIT)}`
      ),
    ]);

  const profiles = await getProfiles(
    deps,
    recentSessions.map((item) => item.profile_id).filter(Boolean),
    input.projectId
  );
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  return {
    summary: {
      totalSessions: summary[0]?.total_sessions ?? 0,
      totalProfiles: summary[0]?.total_profiles ?? 0,
      totalLocations: input.locations.length,
      totalCountries: new Set(
        input.locations.map((location) => location.country).filter(Boolean)
      ).size,
      totalCities: new Set(
        input.locations.map((location) => location.city).filter(Boolean)
      ).size,
    },
    topReferrers: topReferrers.map((item) => ({
      referrerName: item.referrer_name,
      count: item.count,
    })),
    topPaths,
    topEvents,
    recentProfiles: recentSessions.map((item) => {
      const profile = profileMap.get(item.profile_id);

      return {
        id: item.profile_id || item.session_id,
        profileId:
          item.profile_id && item.profile_id !== '' ? item.profile_id : null,
        sessionId: item.session_id,
        createdAt: convertClickhouseDateToJs(item.created_at),
        latestPath: item.path,
        latestEvent: item.name,
        city: profile?.properties.city || item.city,
        country: profile?.properties.country || item.country,
        firstName: profile?.firstName ?? '',
        lastName: profile?.lastName ?? '',
        email: profile?.email ?? '',
        avatar: profile?.avatar ?? '',
      };
    }),
  };
}

export async function getRealtimeActiveSessions(
  deps: ServiceDeps,
  projectId: string
) {
  const rows = await chQuery<IClickhouseEvent>(
    deps,
    sql`SELECT
      name, session_id, created_at, path, origin, referrer, referrer_name,
      country, city, region, os, os_version, browser, browser_version,
      device
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(ACTIVE_SESSIONS_LIMIT)}`
  );
  return rows.map(transformEvent);
}

export function getRealtimePaths(deps: ServiceDeps, projectId: string) {
  return chQuery<{
    origin: string;
    path: string;
    count: number;
    avg_duration: number;
    unique_sessions: number;
  }>(
    deps,
    sql`SELECT origin, path, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM ${sql.id(TABLE_NAMES.events)} WHERE project_id = ${sql.string(projectId)} AND path != ${sql.string('')} AND created_at >= ${sql.string(formatClickhouseDate(since()))} GROUP BY path, origin ORDER BY count DESC LIMIT ${sql.uint64(PATHS_LIMIT)}`,
    CLIX_SESSION_TIMEZONE
  );
}

export function getRealtimeReferrals(deps: ServiceDeps, projectId: string) {
  return chQuery<{
    referrer_name: string;
    count: number;
    avg_duration: number;
    unique_sessions: number;
  }>(
    deps,
    sql`SELECT referrer_name, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM ${sql.id(TABLE_NAMES.events)} WHERE project_id = ${sql.string(projectId)} AND referrer_name IS NOT NULL AND created_at >= ${sql.string(formatClickhouseDate(since()))} GROUP BY referrer_name ORDER BY count DESC LIMIT ${sql.uint64(REFERRALS_LIMIT)}`,
    CLIX_SESSION_TIMEZONE
  );
}

export function getRealtimeGeo(deps: ServiceDeps, projectId: string) {
  return chQuery<{
    country: string;
    city: string;
    count: number;
    avg_duration: number;
    unique_sessions: number;
  }>(
    deps,
    sql`SELECT country, city, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM ${sql.id(TABLE_NAMES.events)} WHERE project_id = ${sql.string(projectId)} AND created_at >= ${sql.string(formatClickhouseDate(since()))} GROUP BY country, city ORDER BY count DESC LIMIT ${sql.uint64(GEO_LIMIT)}`,
    CLIX_SESSION_TIMEZONE
  );
}
// --- /live websocket glue -------------------------------------------------
//
// Framework-agnostic: resolve to an unsubscribe function each, exactly
// `subscribeToPublishedEvent`'s own shape. realtime.routes.ts (Elysia/Bun)
// awaits these directly; nothing here is HTTP- or ws-library-specific.

export function getActiveVisitorCount(
  deps: ServiceDeps,
  projectId: string
): Promise<number> {
  return deps.buffers.event.getActiveVisitorCount(projectId);
}

/** V1: `wsVisitors` — re-count on every batch touching this project. */
export async function subscribeToVisitorActivity(
  projectId: string,
  onActivity: () => void
): Promise<() => void> {
  return subscribeToPublishedEvent('events', 'batch', (event) => {
    if (event.projectId === projectId) {
      onActivity();
    }
  });
}

/** V1: `wsProjectEvents` — the batch's own count, not a re-query. */
export async function subscribeToProjectEventBatches(
  projectId: string,
  onBatch: (event: IPublishChannels['events']['batch']) => void
): Promise<() => void> {
  return subscribeToPublishedEvent('events', 'batch', (event) => {
    if (event.projectId === projectId) {
      onBatch(event);
    }
  });
}

/** V1: `wsProjectNotifications`. */
export async function subscribeToProjectNotifications(
  projectId: string,
  onNotification: (
    notification: IPublishChannels['notification']['created']
  ) => void
): Promise<() => void> {
  return subscribeToPublishedEvent(
    'notification',
    'created',
    (notification) => {
      if (notification.projectId === projectId) {
        onNotification(notification);
      }
    }
  );
}

/**
 * V1: `wsOrganizationEvents`. Scoped to the single organization the caller's
 * membership was verified against, exactly as the three siblings above scope to
 * a verified `projectId`.
 *
 * The channel is instance-wide: without this filter every subscriber saw the
 * `organizationId` of every organization whose subscription changed, which is a
 * cross-tenant identifier leak (F2). V1 had no filter either — this is a
 * deliberate divergence, approved 2026-09-15.
 */
export async function subscribeToOrganizationSubscriptionUpdates(
  organizationId: string,
  onUpdate: (
    message: IPublishChannels['organization']['subscription_updated']
  ) => void
): Promise<() => void> {
  return subscribeToPublishedEvent(
    'organization',
    'subscription_updated',
    (message) => {
      if (message.organizationId === organizationId) {
        onUpdate(message);
      }
    }
  );
}

export function createRealtimeService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getCoordinates: (
      projectId: string
    ): ReturnType<typeof getRealtimeCoordinates> =>
      getRealtimeCoordinates(deps, projectId),
    getMapBadgeDetails: (
      input: Parameters<typeof getRealtimeMapBadgeDetails>[1]
    ): ReturnType<typeof getRealtimeMapBadgeDetails> =>
      getRealtimeMapBadgeDetails(deps, input),
    getActiveSessions: (
      projectId: string
    ): ReturnType<typeof getRealtimeActiveSessions> =>
      getRealtimeActiveSessions(deps, projectId),
    getPaths: (projectId: string): ReturnType<typeof getRealtimePaths> =>
      getRealtimePaths(deps, projectId),
    getReferrals: (
      projectId: string
    ): ReturnType<typeof getRealtimeReferrals> =>
      getRealtimeReferrals(deps, projectId),
    getGeo: (projectId: string): ReturnType<typeof getRealtimeGeo> =>
      getRealtimeGeo(deps, projectId),
    getActiveVisitorCount: (projectId: string): Promise<number> =>
      getActiveVisitorCount(deps, projectId),
  };
}
