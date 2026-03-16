import {
  ch,
  chQuery,
  clix,
  formatClickhouseDate,
  type IClickhouseEvent,
  TABLE_NAMES,
  transformEvent,
} from '@openpanel/db';
import { subMinutes } from 'date-fns';
import sqlstring from 'sqlstring';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const realtimeRouter = createTRPCRouter({
  coordinates: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const res = await chQuery<{
        city: string;
        country: string;
        long: number;
        lat: number;
      }>(
        `SELECT DISTINCT country, city, longitude as long, latitude as lat FROM ${TABLE_NAMES.events} WHERE project_id = ${sqlstring.escape(input.projectId)} AND created_at >= '${formatClickhouseDate(subMinutes(new Date(), 30))}' ORDER BY created_at DESC`
      );

      return res;
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
        .limit(100)
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
        .limit(100)
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
        .limit(100)
        .execute();

      return res;
    }),
});
