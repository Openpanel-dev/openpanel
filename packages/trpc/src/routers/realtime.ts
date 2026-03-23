import {
  ch,
  chQuery,
  clix,
  convertClickhouseDateToJs,
  formatClickhouseDate,
  getProfiles,
  type IClickhouseEvent,
  TABLE_NAMES,
  transformEvent,
} from '@openpanel/db';
import { subMinutes } from 'date-fns';
import sqlstring from 'sqlstring';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const realtimeLocationSchema = z.object({
  country: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
});

const realtimeBadgeDetailScopeSchema = z.enum([
  'country',
  'city',
  'coordinate',
  'merged',
]);

function buildRealtimeLocationFilter(
  locations: z.infer<typeof realtimeLocationSchema>[]
) {
  const tuples = locations
    .filter(
      (
        location
      ): location is z.infer<typeof realtimeLocationSchema> & {
        lat: number;
        long: number;
      } => typeof location.lat === 'number' && typeof location.long === 'number'
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

function buildRealtimeCountryFilter(
  locations: z.infer<typeof realtimeLocationSchema>[]
) {
  const countries = [
    ...new Set(locations.map((location) => location.country ?? '')),
  ];

  return `coalesce(country, '') IN (${countries
    .map((country) => sqlstring.escape(country))
    .join(', ')})`;
}

function buildRealtimeCityFilter(
  locations: z.infer<typeof realtimeLocationSchema>[]
) {
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
  detailScope: z.infer<typeof realtimeBadgeDetailScopeSchema>;
  locations: z.infer<typeof realtimeLocationSchema>[];
}) {
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

interface CoordinatePoint {
  country: string;
  city: string;
  long: number;
  lat: number;
  count: number;
};

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
  for (const radius of [0.5, 1, 3, 10]) {
    const clustered = mergeByRadius(points, radius);
    if (clustered.length <= target) {
      return clustered;
    }
  }

  return points.slice(0, target);
}

export const realtimeRouter = createTRPCRouter({
  coordinates: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const res = await chQuery<CoordinatePoint>(
        `SELECT
          country,
          city,
          longitude as long,
          latitude as lat,
          COUNT(DISTINCT session_id) as count
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(input.projectId)}
          AND created_at >= now() - INTERVAL 30 MINUTE
          AND longitude IS NOT NULL
          AND latitude IS NOT NULL
        GROUP BY country, city, longitude, latitude
        ORDER BY count DESC
        LIMIT 5000`
      );

      return adaptiveCluster(res, 500);
    }),
  mapBadgeDetails: protectedProcedure
    .input(
      z.object({
        detailScope: realtimeBadgeDetailScopeSchema,
        projectId: z.string(),
        locations: z.array(realtimeLocationSchema).min(1).max(200),
      })
    )
    .query(async ({ input }) => {
      const since = formatClickhouseDate(subMinutes(new Date(), 30));
      const locationFilter = buildRealtimeBadgeDetailsFilter(input);

      const summaryQuery = clix(ch)
        .select<{
          total_sessions: number;
          total_profiles: number;
        }>([
          'COUNT(DISTINCT session_id) as total_sessions',
          "COUNT(DISTINCT nullIf(profile_id, '')) as total_profiles",
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', since)
        .rawWhere(locationFilter);

      const topReferrersQuery = clix(ch)
        .select<{
          referrer_name: string;
          count: number;
        }>(['referrer_name', 'COUNT(DISTINCT session_id) as count'])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', since)
        .where('referrer_name', '!=', '')
        .rawWhere(locationFilter)
        .groupBy(['referrer_name'])
        .orderBy('count', 'DESC')
        .limit(3);

      const topPathsQuery = clix(ch)
        .select<{
          origin: string;
          path: string;
          count: number;
        }>(['origin', 'path', 'COUNT(DISTINCT session_id) as count'])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', since)
        .where('path', '!=', '')
        .rawWhere(locationFilter)
        .groupBy(['origin', 'path'])
        .orderBy('count', 'DESC')
        .limit(3);

      const topEventsQuery = clix(ch)
        .select<{
          name: string;
          count: number;
        }>(['name', 'COUNT(DISTINCT session_id) as count'])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('created_at', '>=', since)
        .where('name', 'NOT IN', [
          'screen_view',
          'session_start',
          'session_end',
        ])
        .rawWhere(locationFilter)
        .groupBy(['name'])
        .orderBy('count', 'DESC')
        .limit(3);

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
                AND created_at >= ${sqlstring.escape(since)}
                AND (${locationFilter})
            ) AS latest_event_per_session
            WHERE rn = 1
            ORDER BY created_at DESC
            LIMIT 8`
          ),
        ]);

      const profiles = await getProfiles(
        recentSessions.map((item) => item.profile_id).filter(Boolean),
        input.projectId
      );
      const profileMap = new Map(
        profiles.map((profile) => [profile.id, profile])
      );

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
              item.profile_id && item.profile_id !== ''
                ? item.profile_id
                : null,
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
    }),
  activeSessions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const rows = await chQuery<IClickhouseEvent>(
        `SELECT
          name, session_id, created_at, path, origin, referrer, referrer_name,
          country, city, region, os, os_version, browser, browser_version,
          device
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(input.projectId)}
          AND created_at >= '${formatClickhouseDate(subMinutes(new Date(), 30))}'
        ORDER BY created_at DESC
        LIMIT 50`
      );
      return rows.map(transformEvent);
    }),
  paths: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const res = await clix(ch)
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
        .where('project_id', '=', input.projectId)
        .where('path', '!=', '')
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30))
        )
        .groupBy(['path', 'origin'])
        .orderBy('count', 'DESC')
        .limit(50)
        .execute();

      return res;
    }),
  referrals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const res = await clix(ch)
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
        .where('project_id', '=', input.projectId)
        .where('referrer_name', 'IS NOT NULL')
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30))
        )
        .groupBy(['referrer_name'])
        .orderBy('count', 'DESC')
        .limit(50)
        .execute();

      return res;
    }),
  geo: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const res = await clix(ch)
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
        .where('project_id', '=', input.projectId)
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30))
        )
        .groupBy(['country', 'city'])
        .orderBy('count', 'DESC')
        .limit(50)
        .execute();

      return res;
    }),
});
