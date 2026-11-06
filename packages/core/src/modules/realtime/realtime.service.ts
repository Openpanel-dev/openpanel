// `TABLE_NAMES` and the date helpers come from core's own copies rather than
// @openpanel/db, whose clickhouse client constructs a real client at module load.

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
import { getGroupsByIds } from '../group/group.service';
import { getProfiles } from '../profile/profile.service';
import type { RealtimeFilters } from './realtime.constants';

const REALTIME_WINDOW_MINUTES = 30;
const ONLINE_WINDOW_MINUTES = 5;
const ACTIVE_SESSIONS_LIMIT = 50;
const RECENT_SESSIONS_LIMIT = 30;
const SESSION_START_EVENT = 'session_start';
const ACTIVE_PEOPLE_LIMIT = 30;
const ACTIVE_GROUPS_LIMIT = 30;
const TOP_PAGES_LIMIT = 10;
const TOP_SOURCES_LIMIT = 8;
const FILTER_OPTIONS_LIMIT = 30;
const MS_PER_MINUTE = 60_000;
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
// Statements that send `session_timezone: 'UTC'` keep sending it so result sets stay
// consistent; the raw `chQuery` ones send none.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;

/** Captures the host of a URL and matches nothing else, such as `Google`. */
const REFERRER_URL_HOST_PATTERN =
  '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^/@]*@)?(?:www\\.)?([^/:?#]+)';

/** `referrer_name` holds the full URL for any referrer we have no name for. */
export const REFERRER_HOST = sql`if(match(referrer_name, ${sql.string(REFERRER_URL_HOST_PATTERN)}), extract(referrer_name, ${sql.string(REFERRER_URL_HOST_PATTERN)}), referrer_name)`;

function since(): Date {
  return subMinutes(new Date(), REALTIME_WINDOW_MINUTES);
}

function buildRealtimeFilterClause(filters?: RealtimeFilters): SqlFragment {
  const countries = filters?.countries ?? [];
  const referrers = filters?.referrers ?? [];
  const countryClause =
    countries.length > 0
      ? sql` AND country IN ${sql.array('String', countries)}`
      : sql.empty;
  const referrerClause =
    referrers.length > 0
      ? sql` AND ${REFERRER_HOST} IN ${sql.array('String', referrers)}`
      : sql.empty;

  return sql`${countryClause}${referrerClause}`;
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

// `SqlFragment`s compose into every statement; each statement numbers its own
// params at `toStatement()`.

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

/** De-duplicates on the (country, city) pair rather than on the rendered
 *  `('<country>', '<city>')` text, since the pair is the real key. */
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
  projectId: string,
  filters?: RealtimeFilters
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
      AND latitude IS NOT NULL${buildRealtimeFilterClause(filters)}
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
    filters?: RealtimeFilters;
  }
) {
  const sinceDate = formatClickhouseDate(since());
  const locationFilter = sql`(${buildRealtimeBadgeDetailsFilter(input)})${buildRealtimeFilterClause(input.filters)}`;
  const projectIdParam = sql.string(input.projectId);
  const sinceParam = sql.string(sinceDate);
  const events = sql.id(TABLE_NAMES.events);

  const summaryQuery = sql`SELECT COUNT(DISTINCT session_id) as total_sessions, COUNT(DISTINCT nullIf(profile_id, '')) as total_profiles FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND ${locationFilter}`;

  const topReferrersQuery = sql`SELECT ${REFERRER_HOST} AS referrer_host, COUNT(DISTINCT session_id) as count FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND referrer_name != ${sql.string('')} AND ${locationFilter} GROUP BY referrer_host ORDER BY count DESC LIMIT ${sql.uint64(MAP_BADGE_TOP_LIMIT)}`;

  const topPathsQuery = sql`SELECT origin, path, COUNT(DISTINCT session_id) as count FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND path != ${sql.string('')} AND ${locationFilter} GROUP BY origin, path ORDER BY count DESC LIMIT ${sql.uint64(MAP_BADGE_TOP_LIMIT)}`;

  const topEventsQuery = sql`SELECT name, COUNT(DISTINCT session_id) as count FROM ${events} WHERE project_id = ${projectIdParam} AND created_at >= ${sinceParam} AND name NOT IN ${sql.array('String', EXCLUDED_BADGE_EVENT_NAMES)} AND ${locationFilter} GROUP BY name ORDER BY count DESC LIMIT ${sql.uint64(MAP_BADGE_TOP_LIMIT)}`;

  const [summary, topReferrers, topPaths, topEvents, recentSessions] =
    await Promise.all([
      chQuery<{
        total_sessions: number;
        total_profiles: number;
      }>(deps, summaryQuery, CLIX_SESSION_TIMEZONE),
      chQuery<{
        referrer_host: string;
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
      referrerName: item.referrer_host,
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
  projectId: string,
  filters?: RealtimeFilters
) {
  const rows = await chQuery<IClickhouseEvent>(
    deps,
    sql`SELECT
      id, name, session_id, created_at, path, origin, referrer, referrer_name,
      country, city, region, os, os_version, browser, browser_version,
      device
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}${buildRealtimeFilterClause(filters)}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(ACTIVE_SESSIONS_LIMIT)}`
  );
  return rows.map(transformEvent);
}

/** The latest sessions to start, newest first: one `session_start` row each. */
export async function getRealtimeRecentSessions(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters
) {
  const rows = await chQuery<IClickhouseEvent>(
    deps,
    sql`SELECT
      id, name, session_id, profile_id, created_at, path, origin, referrer,
      referrer_name, country, city, region, os, os_version, browser,
      browser_version, device
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND name = ${sql.string(SESSION_START_EVENT)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}${buildRealtimeFilterClause(filters)}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(RECENT_SESSIONS_LIMIT)}`
  );
  return rows.map(transformEvent);
}

export interface RealtimeTopSources {
  referrers: Array<{ name: string; sessions: number }>;
  countries: Array<{ country: string; sessions: number }>;
}

/** Top referrers and top countries from one scan of the window. */
export async function getRealtimeTopSources(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters,
  limit = TOP_SOURCES_LIMIT
): Promise<RealtimeTopSources> {
  const rows = await chQuery<{
    referrer_host: string;
    country: string;
    sessions: number;
    is_referrer_row: number;
    is_country_row: number;
  }>(
    deps,
    sql`SELECT
      ${REFERRER_HOST} AS referrer_host,
      country,
      uniq(session_id) AS sessions,
      grouping(country) AS is_referrer_row,
      grouping(referrer_host) AS is_country_row
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}${buildRealtimeFilterClause(filters)}
    GROUP BY GROUPING SETS ((referrer_host), (country))
    HAVING (is_referrer_row = 1 AND referrer_host != ${sql.string('')})
      OR (is_country_row = 1 AND country != ${sql.string('')})
    ORDER BY sessions DESC
    LIMIT ${sql.uint64(limit)} BY is_referrer_row, is_country_row`
  );

  return {
    referrers: rows
      .filter((row) => row.is_referrer_row === 1)
      .map((row) => ({ name: row.referrer_host, sessions: row.sessions })),
    countries: rows
      .filter((row) => row.is_country_row === 1)
      .map((row) => ({ country: row.country, sessions: row.sessions })),
  };
}

/** Every value worth offering in the filter pickers, whatever is filtered now. */
export function getRealtimeFilterOptions(
  deps: ServiceDeps,
  projectId: string
): Promise<RealtimeTopSources> {
  return getRealtimeTopSources(
    deps,
    projectId,
    undefined,
    FILTER_OPTIONS_LIMIT
  );
}

/** The filtered twin of `getActiveVisitorCount`, which only knows whole projects. */
export async function getRealtimeOnlineCount(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters
): Promise<number> {
  const rows = await chQuery<{ count: number }>(
    deps,
    sql`SELECT uniq(profile_id) AS count
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND profile_id != ${sql.string('')}
      AND created_at >= now() - INTERVAL ${sql.uint64(ONLINE_WINDOW_MINUTES)} MINUTE${buildRealtimeFilterClause(filters)}`
  );

  return rows[0]?.count ?? 0;
}

export interface RealtimeActivePerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  lastSeenAt: Date;
  path: string;
  country: string;
  city: string;
  groups: Array<{ id: string; name: string; type: string }>;
}

/** Identified visitors in the window, most recently active first. */
export async function getRealtimeActivePeople(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters
): Promise<RealtimeActivePerson[]> {
  const rows = await chQuery<{
    profile_id: string;
    last_seen_at: string;
    latest_path: string;
    latest_country: string;
    latest_city: string;
    group_ids: string[];
  }>(
    deps,
    sql`SELECT
      profile_id,
      max(created_at) AS last_seen_at,
      argMax(path, created_at) AS latest_path,
      argMax(country, created_at) AS latest_country,
      argMax(city, created_at) AS latest_city,
      groupUniqArrayArray(groups) AS group_ids
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}
      AND profile_id != ${sql.string('')}
      AND profile_id != device_id${buildRealtimeFilterClause(filters)}
    GROUP BY profile_id
    ORDER BY last_seen_at DESC
    LIMIT ${sql.uint64(ACTIVE_PEOPLE_LIMIT)}`,
    CLIX_SESSION_TIMEZONE
  );

  const profiles = await getProfiles(
    deps,
    rows.map((row) => row.profile_id),
    projectId
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  // Membership set on the profile counts too: not every event carries `groups`.
  const groupIdsOf = (row: (typeof rows)[number]) => [
    ...new Set([
      ...row.group_ids,
      ...(profileById.get(row.profile_id)?.groups ?? []),
    ]),
  ];
  const groups = await getGroupsByIds(deps, projectId, [
    ...new Set(rows.flatMap(groupIdsOf)),
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));

  return rows.map((row) => {
    const profile = profileById.get(row.profile_id);

    return {
      id: row.profile_id,
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      email: profile?.email ?? '',
      avatar: profile?.avatar ?? '',
      lastSeenAt: convertClickhouseDateToJs(row.last_seen_at),
      path: row.latest_path,
      country: row.latest_country,
      city: row.latest_city,
      groups: groupIdsOf(row).flatMap((id) => {
        const group = groupById.get(id);
        return group
          ? [{ id: group.id, name: group.name, type: group.type }]
          : [];
      }),
    };
  });
}

export interface RealtimeActiveGroup {
  id: string;
  name: string;
  type: string;
  people: number;
  lastSeenAt: Date;
}

/** Groups with activity in the window, most recently active first. */
export async function getRealtimeActiveGroups(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters
): Promise<RealtimeActiveGroup[]> {
  const rows = await chQuery<{
    group_id: string;
    people: number;
    last_seen_at: string;
  }>(
    deps,
    sql`SELECT
      group_id,
      uniq(profile_id) AS people,
      max(created_at) AS last_seen_at
    FROM ${sql.id(TABLE_NAMES.events)}
    ARRAY JOIN groups AS group_id
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}${buildRealtimeFilterClause(filters)}
    GROUP BY group_id
    ORDER BY last_seen_at DESC
    LIMIT ${sql.uint64(ACTIVE_GROUPS_LIMIT)}`,
    CLIX_SESSION_TIMEZONE
  );

  const groups = await getGroupsByIds(
    deps,
    projectId,
    rows.map((row) => row.group_id)
  );
  const groupById = new Map(groups.map((group) => [group.id, group]));

  return rows.flatMap((row) => {
    const group = groupById.get(row.group_id);
    return group
      ? [
          {
            id: group.id,
            name: group.name,
            type: group.type,
            people: row.people,
            lastSeenAt: convertClickhouseDateToJs(row.last_seen_at),
          },
        ]
      : [];
  });
}

/** The most visited paths in the window. */
export async function getRealtimeTopPages(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters
): Promise<Array<{ id: string; path: string; sessions: number }>> {
  const rows = await chQuery<{ path: string; sessions: number }>(
    deps,
    sql`SELECT path, uniq(session_id) AS sessions
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(since()))}
      AND path != ${sql.string('')}${buildRealtimeFilterClause(filters)}
    GROUP BY path
    ORDER BY sessions DESC
    LIMIT ${sql.uint64(TOP_PAGES_LIMIT)}`
  );

  return rows.map((row) => ({ id: row.path, ...row }));
}

export interface RealtimeHistogram {
  /** Distinct sessions across the whole window. */
  totalSessions: number;
  /** One entry per minute of the window, oldest first, empty minutes included. */
  minutes: Array<{ minute: string; sessions: number; visitors: number }>;
}

/** Per-minute activity for the window, with the window total from the same scan. */
export async function getRealtimeHistogram(
  deps: ServiceDeps,
  projectId: string,
  filters?: RealtimeFilters
): Promise<RealtimeHistogram> {
  const windowStart = since();
  const rows = await chQuery<{
    minute: string;
    sessions: number;
    visitors: number;
    is_total: number;
  }>(
    deps,
    sql`SELECT
      toStartOfMinute(created_at) AS minute,
      uniq(session_id) AS sessions,
      uniq(profile_id) AS visitors,
      grouping(minute) AS is_total
    FROM ${sql.id(TABLE_NAMES.events)}
    WHERE project_id = ${sql.string(projectId)}
      AND created_at >= ${sql.string(formatClickhouseDate(windowStart))}${buildRealtimeFilterClause(filters)}
    GROUP BY GROUPING SETS ((minute), ())`,
    CLIX_SESSION_TIMEZONE
  );

  const byMinute = new Map<number, { sessions: number; visitors: number }>();
  let totalSessions = 0;
  for (const row of rows) {
    if (row.is_total === 1) {
      totalSessions = row.sessions;
      continue;
    }
    byMinute.set(Date.parse(`${row.minute.replace(' ', 'T')}Z`), {
      sessions: row.sessions,
      visitors: row.visitors,
    });
  }

  const minutes: RealtimeHistogram['minutes'] = [];
  const firstMinute =
    Math.floor(windowStart.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  const lastMinute = Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE;
  for (let at = firstMinute; at <= lastMinute; at += MS_PER_MINUTE) {
    const counts = byMinute.get(at);
    minutes.push({
      minute: new Date(at).toISOString(),
      sessions: counts?.sessions ?? 0,
      visitors: counts?.visitors ?? 0,
    });
  }

  return { totalSessions, minutes };
}

// Each resolves to an unsubscribe function; nothing here is HTTP- or ws-library-specific.

export function getActiveVisitorCount(
  deps: ServiceDeps,
  projectId: string
): Promise<number> {
  return deps.buffers.event.getActiveVisitorCount(projectId);
}

/** Re-counts on every batch touching this project. */
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

/** The batch's own count, not a re-query. */
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
 * Scoped to the single organization the caller's membership was verified against.
 * The channel is instance-wide: unscoped, every subscriber saw the `organizationId`
 * of every organization whose subscription changed (a cross-tenant leak).
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
    getRecentSessions: (
      projectId: string
    ): ReturnType<typeof getRealtimeRecentSessions> =>
      getRealtimeRecentSessions(deps, projectId),
    getTopSources: (projectId: string): Promise<RealtimeTopSources> =>
      getRealtimeTopSources(deps, projectId),
    getHistogram: (projectId: string): Promise<RealtimeHistogram> =>
      getRealtimeHistogram(deps, projectId),
    getActiveVisitorCount: (projectId: string): Promise<number> =>
      getActiveVisitorCount(deps, projectId),
  };
}
