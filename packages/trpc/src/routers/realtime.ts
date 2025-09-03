import { z } from 'zod';

import {
  type EventMeta,
  TABLE_NAMES,
  ch,
  chQuery,
  clix,
  db,
  formatClickhouseDate,
} from '@openpanel/db';

import { subMinutes } from 'date-fns';
import { uniqBy } from 'ramda';
import sqlstring from 'sqlstring';
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
        `SELECT DISTINCT country, city, longitude as long, latitude as lat FROM ${TABLE_NAMES.events} WHERE project_id = ${sqlstring.escape(input.projectId)} AND created_at >= '${formatClickhouseDate(subMinutes(new Date(), 30))}' ORDER BY created_at DESC`,
      );

      return res;
    }),
  activeSessions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const meta = await db.eventMeta.findMany({
        where: {
          projectId: input.projectId,
        },
      });
      const map = new Map<string, EventMeta>(meta.map((m) => [m.name, m]));
      const res = await clix(ch)
        .select<{
          id: string;
          country: string;
          city: string;
          longitude: number;
          latitude: number;
          path: string;
          origin: string;
          referrer_name: string;
          browser: string;
          os: string;
          name: string;
          device: string;
          created_at: Date;
        }>([
          'id',
          'name',
          'country',
          'city',
          'longitude',
          'latitude',
          'path',
          'origin',
          'referrer_name',
          'referrer_type',
          'os',
          'browser',
          'device',
          'created_at',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30)),
        )
        .execute();

      return uniqBy(
        (session) => session.id,
        res.map((session) => ({
          ...session,
          meta: map.get(session.name),
        })),
      );
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
        }>([
          'origin',
          'path',
          'COUNT(*) as count',
          'round(avg(duration)/1000, 2) as avg_duration',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('path', '!=', '')
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30)),
        )
        .groupBy(['path', 'origin'])
        .orderBy('count', 'DESC')
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
        }>([
          'referrer_name',
          'COUNT(*) as count',
          'round(avg(duration)/1000, 2) as avg_duration',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('referrer_name', 'IS NOT NULL')
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30)),
        )
        .groupBy(['referrer_name'])
        .orderBy('count', 'DESC')
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
        }>([
          'country',
          'city',
          'COUNT(*) as count',
          'round(avg(duration)/1000, 2) as avg_duration',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where(
          'created_at',
          '>=',
          formatClickhouseDate(subMinutes(new Date(), 30)),
        )
        .groupBy(['country', 'city'])
        .orderBy('count', 'DESC')
        .execute();

      return res;
    }),
});
