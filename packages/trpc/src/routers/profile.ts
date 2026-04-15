import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { z } from 'zod';

import {
  TABLE_NAMES,
  chQuery,
  createSqlBuilder,
  getEnrichedProfileList,
  getProfileById,
  getProfileList,
  getProfileListCount,
  getProfileMetrics,
  getProfiles,
} from '@openpanel/db';

const zSortBy = z
  .enum([
    'name',
    'country',
    'os',
    'model',
    'plan',
    'createdAt',
    'lastSeen',
    'firstSeenActivity',
    'eventCount',
    'totalDuration',
    'sessionCount',
  ])
  .optional();
const zSortDirection = z.enum(['asc', 'desc']).optional();

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const profileRouter = createTRPCRouter({
  byId: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return getProfileById(profileId, projectId);
    }),

  metrics: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return getProfileMetrics(profileId, projectId);
    }),

  /**
   * Platform/client breakdown per profile: Web vs iOS vs Android vs
   * React Native, with sessions, events, last-seen-per-platform and
   * (when the SDK sends them) the most recent app version / build.
   * Lets the UI answer "does this user use both the web and the app,
   * and which one do they reach for most?".
   */
  platforms: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      const rows = await chQuery<{
        sdk_name: string;
        os: string;
        browsers: string[];
        sessions: number;
        events: number;
        last_seen: string;
        app_version: string;
        build_number: string;
      }>(
        `SELECT
          sdk_name,
          any(os) as os,
          -- Return every distinct browser + version this profile has
          -- used on this platform. Filter out empty strings (native
          -- apps don't populate browser) and trim to avoid stray spaces
          -- when either field is empty.
          arrayFilter(
            x -> length(x) > 0,
            arrayMap(
              x -> trim(concat(tupleElement(x, 1), ' ', tupleElement(x, 2))),
              groupUniqArray(tuple(browser, browser_version))
            )
          ) as browsers,
          count(distinct session_id) as sessions,
          count() as events,
          max(created_at) as last_seen,
          argMax(properties['__version'], created_at) as app_version,
          argMax(properties['__buildNumber'], created_at) as build_number
         FROM ${TABLE_NAMES.events}
         WHERE profile_id = ${sqlstring.escape(profileId)}
           AND project_id = ${sqlstring.escape(projectId)}
         GROUP BY sdk_name
         ORDER BY sessions DESC`,
      );

      // Map raw sdk_name values to a friendly label. Falls back to OS
      // when the SDK field is empty (older events / imports).
      function friendlyLabel(sdkName: string, os: string) {
        const s = (sdkName || '').toLowerCase();
        if (!s) {
          if (os.toLowerCase().includes('ios')) return 'iOS';
          if (os.toLowerCase().includes('android')) return 'Android';
          return 'Unknown';
        }
        if (s.includes('web') || s === 'js' || s.includes('browser')) {
          return 'Web';
        }
        if (s.includes('ios') || s.includes('swift')) return 'iOS';
        if (s.includes('android') || s.includes('kotlin')) return 'Android';
        if (s.includes('react-native') || s.includes('reactnative')) {
          return 'React Native';
        }
        if (s.includes('node')) return 'Server';
        return sdkName;
      }

      return rows.map((r) => ({
        sdkName: r.sdk_name || null,
        label: friendlyLabel(r.sdk_name, r.os),
        sessions: Number(r.sessions) || 0,
        events: Number(r.events) || 0,
        lastSeen: r.last_seen,
        appVersion: r.app_version || null,
        buildNumber: r.build_number || null,
        browsers: Array.isArray(r.browsers) ? r.browsers : [],
      }));
    }),

  /**
   * Where did this profile come from? Returns the first recorded session
   * (the acquisition event) plus a rollup of every distinct source the
   * profile has arrived through since. Used by the "Source" card on the
   * profile detail page.
   */
  source: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      const whereClause = `profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}`;

      const [firstRows, allRows] = await Promise.all([
        chQuery<{
          referrer: string;
          referrer_name: string;
          referrer_type: string;
          utm_source: string;
          utm_medium: string;
          utm_campaign: string;
          utm_term: string;
          utm_content: string;
          entry_path: string;
          entry_origin: string;
          created_at: string;
        }>(
          `SELECT referrer, referrer_name, referrer_type,
                  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                  entry_path, entry_origin, created_at
           FROM ${TABLE_NAMES.sessions} FINAL
           WHERE ${whereClause}
           ORDER BY created_at ASC
           LIMIT 1`,
        ),
        chQuery<{
          referrer_name: string;
          referrer_type: string;
          utm_source: string;
          utm_medium: string;
          utm_campaign: string;
          count: number;
        }>(
          `SELECT referrer_name, referrer_type,
                  utm_source, utm_medium, utm_campaign,
                  count() as count
           FROM ${TABLE_NAMES.sessions} FINAL
           WHERE ${whereClause}
           GROUP BY referrer_name, referrer_type, utm_source, utm_medium, utm_campaign
           ORDER BY count DESC
           LIMIT 10`,
        ),
      ]);

      const first = firstRows[0] ?? null;
      return {
        first: first
          ? {
              referrer: first.referrer,
              referrerName: first.referrer_name,
              referrerType: first.referrer_type,
              utmSource: first.utm_source,
              utmMedium: first.utm_medium,
              utmCampaign: first.utm_campaign,
              utmTerm: first.utm_term,
              utmContent: first.utm_content,
              entryPath: first.entry_path,
              entryOrigin: first.entry_origin,
              createdAt: first.created_at,
            }
          : null,
        sources: allRows.map((r) => ({
          referrerName: r.referrer_name,
          referrerType: r.referrer_type,
          utmSource: r.utm_source,
          utmMedium: r.utm_medium,
          utmCampaign: r.utm_campaign,
          count: Number(r.count) || 0,
        })),
      };
    }),

  activity: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return chQuery<{ count: number; date: string }>(
        `SELECT count(*) as count, toStartOfDay(created_at) as date FROM ${TABLE_NAMES.events} WHERE project_id = ${sqlstring.escape(projectId)} and profile_id = ${sqlstring.escape(profileId)} GROUP BY date ORDER BY date DESC`,
      );
    }),

  mostEvents: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return chQuery<{ count: number; name: string }>(
        `SELECT count(*) as count, name FROM ${TABLE_NAMES.events} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = ${sqlstring.escape(projectId)} and profile_id = ${sqlstring.escape(profileId)} GROUP BY name ORDER BY count DESC`,
      );
    }),

  popularRoutes: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return chQuery<{ count: number; path: string }>(
        `SELECT count(*) as count, path FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND project_id = ${sqlstring.escape(projectId)} and profile_id = ${sqlstring.escape(profileId)} GROUP BY path ORDER BY count DESC LIMIT 10`,
      );
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from ${TABLE_NAMES.profiles} where project_id = ${sqlstring.escape(projectId)};`,
      );

      const properties = events
        .flatMap((event) => event.keys)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      properties.push('id', 'first_name', 'last_name', 'email');

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq,
      )(properties);
    }),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
        isExternal: z.boolean().optional(),
        sortBy: zSortBy,
        sortDirection: zSortDirection,
      }),
    )
    .query(async ({ input }) => {
      const [data, count] = await Promise.all([
        getEnrichedProfileList(input),
        getProfileListCount(input),
      ]);
      return {
        data,
        meta: {
          count,
          pageCount: input.take,
        },
      };
    }),

  // Power Users shares the same enriched row shape as `list` — it's just
  // "identified profiles, default-sorted by event_count DESC". Folding it
  // onto the same query path means one set of columns for all three tabs.
  powerUsers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
        sortBy: zSortBy,
        sortDirection: zSortDirection,
      }),
    )
    .query(async ({ input }) => {
      const listInput = {
        ...input,
        isExternal: true,
        sortBy: input.sortBy ?? ('eventCount' as const),
        sortDirection: input.sortDirection ?? ('desc' as const),
      };
      const [data, count] = await Promise.all([
        getEnrichedProfileList(listInput),
        getProfileListCount(listInput),
      ]);
      return {
        data,
        meta: {
          count,
          pageCount: input.take,
        },
      };
    }),

  values: protectedProcedure
    .input(
      z.object({
        property: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { property, projectId } }) => {
      const { sb, getSql } = createSqlBuilder();
      sb.from = TABLE_NAMES.profiles;
      sb.where.project_id = `project_id = ${sqlstring.escape(projectId)}`;
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${sqlstring.escape(
          property.replace(/^properties\./, '').replace('.*.', '.%.'),
        )}))) as values`;
      } else {
        sb.select.values = `${property} as values`;
      }

      const profiles = await chQuery<{ values: string[] }>(getSql());

      const values = pipe(
        (data: typeof profiles) => map(prop('values'), data),
        flatten,
        uniq,
        sort((a, b) => a.length - b.length),
      )(profiles);

      return {
        values,
      };
    }),
});
