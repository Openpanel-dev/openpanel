// Two halves ported from different V1 places, both landing here (module map:
// realtime owns "R,H,S"):
//
//  1. The six ClickHouse queries, moved from
//     packages/trpc/src/routers/realtime.ts (M6-007). V1's trpc router stays
//     the LIVE route (DELEGATE PATTERN, ONE shared tRPC instance) and now
//     delegates its handler bodies onto the functions below, exported through
//     `@openpanel/core`'s barrel, same as notification.ts/reference.ts.
//
//  2. The `/live` websocket glue, ported FRESH from
//     apps/api/src/controllers/live.controller.ts's business logic —
//     `getActiveVisitorCount` and the four `subscribeToPublishedEvent` calls,
//     filtered by projectId where V1 filters inline in the callback. V1's
//     Fastify `@fastify/websocket` controller is LEFT UNTOUCHED: its socket
//     type (the `ws` package's `WebSocket`) has nothing in common with
//     Elysia/Bun's `ElysiaWS`, so there is no shim to delegate through, and
//     touching the golden-harness-critical V1 ws stack for a few lines of
//     framework glue is the risk this port avoids (task M6-007 notes).
//     `subscribeToPublishedEvent` itself is already framework-agnostic
//     (`@openpanel/redis`, plain callback), so both stacks call the exact
//     same Redis subscription underneath.
//
// M10-005: every query function takes `ServiceDeps`. The ClickHouse CLIENT is
// `deps.ch` — reads through shared/ch-query.ts, `clix(deps.ch)` for the four
// builder queries — and the event buffer is `deps.buffers.event`, so the
// `loadChClient` / `loadEventBuffer` lazy imports of @openpanel/db are gone
// and the requestId reaches the query (ADR-018 R1, docs/TECH_DEBT.md §2, §4).
//
// ClickHouse queries here still go through clix/sqlstring, not the `sql` tag:
// ADR-013 converts the analytics read path one query per P7 task, and this
// module's queries haven't been converted yet. `clix` and `TABLE_NAMES` are
// therefore still needed and come from the v1-compat seam's pure-helper hop
// (project.service.ts's `loadChHelpers` does the same) rather than a direct
// @openpanel/db import.

import type { IPublishChannels } from '@openpanel/redis';
import { subMinutes } from 'date-fns';
import sqlstring from 'sqlstring';
import type { ServiceDeps } from '../../services';
import { chQuery } from '../../shared/ch-query';
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

function loadChHelpers() {
  return import('../../v1-compat').then((m) => m.compatChHelpers());
}

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

function buildRealtimeLocationFilter(locations: RealtimeLocation[]): string {
  const tuples = locations
    .filter(
      (
        location
      ): location is RealtimeLocation & { lat: number; long: number } =>
        typeof location.lat === 'number' && typeof location.long === 'number'
    )
    .map(
      (location) =>
        `(${sqlstring.escape(location.country ?? '')}, ${sqlstring.escape(
          location.city ?? ''
        )}, toDecimal64(${location.long.toFixed(4)}, 4), toDecimal64(${location.lat.toFixed(4)}, 4))`
    );

  if (tuples.length === 0) {
    return buildRealtimeCityFilter(locations);
  }

  return `(coalesce(country, ''), coalesce(city, ''), toDecimal64(longitude, 4), toDecimal64(latitude, 4)) IN (${tuples.join(', ')})`;
}

function buildRealtimeCountryFilter(locations: RealtimeLocation[]): string {
  const countries = [
    ...new Set(locations.map((location) => location.country ?? '')),
  ];

  return `coalesce(country, '') IN (${countries
    .map((country) => sqlstring.escape(country))
    .join(', ')})`;
}

function buildRealtimeCityFilter(locations: RealtimeLocation[]): string {
  const tuples = [
    ...new Set(
      locations.map(
        (location) =>
          `(${sqlstring.escape(location.country ?? '')}, ${sqlstring.escape(
            location.city ?? ''
          )})`
      )
    ),
  ];

  if (tuples.length === 0) {
    return buildRealtimeCountryFilter(locations);
  }

  return `(coalesce(country, ''), coalesce(city, '')) IN (${tuples.join(', ')})`;
}

function buildRealtimeBadgeDetailsFilter(input: {
  detailScope: RealtimeBadgeDetailScope;
  locations: RealtimeLocation[];
}): string {
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
  const { TABLE_NAMES } = await loadChHelpers();

  const res = await chQuery<CoordinatePoint>(
    deps,
    `SELECT
      country,
      city,
      longitude as long,
      latitude as lat,
      COUNT(DISTINCT session_id) as count
    FROM ${TABLE_NAMES.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND created_at >= now() - INTERVAL ${REALTIME_WINDOW_MINUTES} MINUTE
      AND longitude IS NOT NULL
      AND latitude IS NOT NULL
    GROUP BY country, city, longitude, latitude
    ORDER BY count DESC
    LIMIT ${COORDINATES_QUERY_LIMIT}`
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
  const { clix, TABLE_NAMES, formatClickhouseDate, convertClickhouseDateToJs } =
    await loadChHelpers();

  const sinceDate = formatClickhouseDate(since());
  const locationFilter = buildRealtimeBadgeDetailsFilter(input);

  const summaryQuery = clix(deps.ch)
    .select<{
      total_sessions: number;
      total_profiles: number;
    }>([
      'COUNT(DISTINCT session_id) as total_sessions',
      "COUNT(DISTINCT nullIf(profile_id, '')) as total_profiles",
    ])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', input.projectId)
    .where('created_at', '>=', sinceDate)
    .rawWhere(locationFilter);

  const topReferrersQuery = clix(deps.ch)
    .select<{
      referrer_name: string;
      count: number;
    }>(['referrer_name', 'COUNT(DISTINCT session_id) as count'])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', input.projectId)
    .where('created_at', '>=', sinceDate)
    .where('referrer_name', '!=', '')
    .rawWhere(locationFilter)
    .groupBy(['referrer_name'])
    .orderBy('count', 'DESC')
    .limit(MAP_BADGE_TOP_LIMIT);

  const topPathsQuery = clix(deps.ch)
    .select<{
      origin: string;
      path: string;
      count: number;
    }>(['origin', 'path', 'COUNT(DISTINCT session_id) as count'])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', input.projectId)
    .where('created_at', '>=', sinceDate)
    .where('path', '!=', '')
    .rawWhere(locationFilter)
    .groupBy(['origin', 'path'])
    .orderBy('count', 'DESC')
    .limit(MAP_BADGE_TOP_LIMIT);

  const topEventsQuery = clix(deps.ch)
    .select<{
      name: string;
      count: number;
    }>(['name', 'COUNT(DISTINCT session_id) as count'])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', input.projectId)
    .where('created_at', '>=', sinceDate)
    .where('name', 'NOT IN', ['screen_view', 'session_start', 'session_end'])
    .rawWhere(locationFilter)
    .groupBy(['name'])
    .orderBy('count', 'DESC')
    .limit(MAP_BADGE_TOP_LIMIT);

  const [summary, topReferrers, topPaths, topEvents, recentSessions] =
    await Promise.all([
      summaryQuery.execute(),
      topReferrersQuery.execute(),
      topPathsQuery.execute(),
      topEventsQuery.execute(),
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
        `SELECT
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
          FROM ${TABLE_NAMES.events}
          WHERE project_id = ${sqlstring.escape(input.projectId)}
            AND created_at >= ${sqlstring.escape(sinceDate)}
            AND (${locationFilter})
        ) AS latest_event_per_session
        WHERE rn = 1
        ORDER BY created_at DESC
        LIMIT ${MAP_BADGE_RECENT_SESSIONS_LIMIT}`
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
  const { TABLE_NAMES, formatClickhouseDate } = await loadChHelpers();

  const rows = await chQuery<IClickhouseEvent>(
    deps,
    `SELECT
      name, session_id, created_at, path, origin, referrer, referrer_name,
      country, city, region, os, os_version, browser, browser_version,
      device
    FROM ${TABLE_NAMES.events}
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND created_at >= '${formatClickhouseDate(since())}'
    ORDER BY created_at DESC
    LIMIT ${ACTIVE_SESSIONS_LIMIT}`
  );
  return rows.map(transformEvent);
}

export async function getRealtimePaths(deps: ServiceDeps, projectId: string) {
  const { clix, TABLE_NAMES, formatClickhouseDate } = await loadChHelpers();

  return await clix(deps.ch)
    .select<{
      origin: string;
      path: string;
      count: number;
      avg_duration: number;
      unique_sessions: number;
    }>([
      'origin',
      'path',
      'COUNT(*) as count',
      'COUNT(DISTINCT session_id) as unique_sessions',
      'round(avg(duration)/1000, 2) as avg_duration',
    ])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', projectId)
    .where('path', '!=', '')
    .where('created_at', '>=', formatClickhouseDate(since()))
    .groupBy(['path', 'origin'])
    .orderBy('count', 'DESC')
    .limit(PATHS_LIMIT)
    .execute();
}

export async function getRealtimeReferrals(
  deps: ServiceDeps,
  projectId: string
) {
  const { clix, TABLE_NAMES, formatClickhouseDate } = await loadChHelpers();

  return await clix(deps.ch)
    .select<{
      referrer_name: string;
      count: number;
      avg_duration: number;
      unique_sessions: number;
    }>([
      'referrer_name',
      'COUNT(*) as count',
      'COUNT(DISTINCT session_id) as unique_sessions',
      'round(avg(duration)/1000, 2) as avg_duration',
    ])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', projectId)
    .where('referrer_name', 'IS NOT NULL')
    .where('created_at', '>=', formatClickhouseDate(since()))
    .groupBy(['referrer_name'])
    .orderBy('count', 'DESC')
    .limit(REFERRALS_LIMIT)
    .execute();
}

export async function getRealtimeGeo(deps: ServiceDeps, projectId: string) {
  const { clix, TABLE_NAMES, formatClickhouseDate } = await loadChHelpers();

  return await clix(deps.ch)
    .select<{
      country: string;
      city: string;
      count: number;
      avg_duration: number;
      unique_sessions: number;
    }>([
      'country',
      'city',
      'COUNT(*) as count',
      'COUNT(DISTINCT session_id) as unique_sessions',
      'round(avg(duration)/1000, 2) as avg_duration',
    ])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', projectId)
    .where('created_at', '>=', formatClickhouseDate(since()))
    .groupBy(['country', 'city'])
    .orderBy('count', 'DESC')
    .limit(GEO_LIMIT)
    .execute();
}

// --- /live websocket glue -------------------------------------------------
//
// Framework-agnostic: resolve to an unsubscribe function each, exactly
// `subscribeToPublishedEvent`'s own shape. realtime.routes.ts (Elysia/Bun)
// awaits these directly; nothing here is HTTP- or ws-library-specific.
//
// `@openpanel/redis` is LAZY here for its own reason: it has no
// import-time side effect (its
// clients connect lazily on first use — insight.service.ts already imports
// `getRedisCache` from it statically), but several modules' tests replace the
// whole package with `mock.module('@openpanel/redis', () => ({ subset }))`.
// A new static named import here would demand `subscribeToPublishedEvent` on
// every one of those subsets the moment this module joins the eager barrel
// chain (rpc.router.ts), breaking tests this task does not own.
function loadRedis() {
  return import('@openpanel/redis');
}

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
  const { subscribeToPublishedEvent } = await loadRedis();
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
  const { subscribeToPublishedEvent } = await loadRedis();
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
  const { subscribeToPublishedEvent } = await loadRedis();
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

/** V1: `wsOrganizationEvents` — every subscriber, no per-org filter (V1 has none either). */
export async function subscribeToOrganizationSubscriptionUpdates(
  onUpdate: (
    message: IPublishChannels['organization']['subscription_updated']
  ) => void
): Promise<() => void> {
  const { subscribeToPublishedEvent } = await loadRedis();
  return subscribeToPublishedEvent(
    'organization',
    'subscription_updated',
    onUpdate
  );
}

export interface RealtimeService {
  getCoordinates(projectId: string): ReturnType<typeof getRealtimeCoordinates>;
  getMapBadgeDetails(
    input: Parameters<typeof getRealtimeMapBadgeDetails>[1]
  ): ReturnType<typeof getRealtimeMapBadgeDetails>;
  getActiveSessions(
    projectId: string
  ): ReturnType<typeof getRealtimeActiveSessions>;
  getPaths(projectId: string): ReturnType<typeof getRealtimePaths>;
  getReferrals(projectId: string): ReturnType<typeof getRealtimeReferrals>;
  getGeo(projectId: string): ReturnType<typeof getRealtimeGeo>;
  getActiveVisitorCount(projectId: string): Promise<number>;
}

export function createRealtimeService(deps: ServiceDeps): RealtimeService {
  return {
    getCoordinates: (projectId) => getRealtimeCoordinates(deps, projectId),
    getMapBadgeDetails: (input) => getRealtimeMapBadgeDetails(deps, input),
    getActiveSessions: (projectId) =>
      getRealtimeActiveSessions(deps, projectId),
    getPaths: (projectId) => getRealtimePaths(deps, projectId),
    getReferrals: (projectId) => getRealtimeReferrals(deps, projectId),
    getGeo: (projectId) => getRealtimeGeo(deps, projectId),
    getActiveVisitorCount: (projectId) =>
      getActiveVisitorCount(deps, projectId),
  };
}
