import { z } from 'zod';

import {
  type EventMeta,
  TABLE_NAMES,
  ch,
  chQuery,
  clix,
  db,
  formatClickhouseDate,
  getDurationSql,
  getEventList,
} from '@openpanel/db';

import { subMinutes } from 'date-fns';
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
      return getEventList({
        projectId: input.projectId,
        take: 30,
        select: {
          name: true,
          path: true,
          origin: true,
          referrer: true,
          referrerName: true,
          referrerType: true,
          country: true,
          device: true,
          os: true,
          browser: true,
          createdAt: true,
          profile: true,
          meta: true,
        },
      });
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
          `round(avg(${getDurationSql()})/1000, 2) as avg_duration`,
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
        }>([
          'referrer_name',
          'COUNT(*) as count',
          `round(avg(${getDurationSql()})/1000, 2) as avg_duration`,
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
        }>([
          'country',
          'city',
          'COUNT(*) as count',
          `round(avg(${getDurationSql()})/1000, 2) as avg_duration`,
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
        .limit(100)
        .execute();

      return res;
    }),
});
