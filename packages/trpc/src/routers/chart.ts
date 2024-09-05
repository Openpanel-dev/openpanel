import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import { escape } from 'sqlstring';
import { z } from 'zod';

import {
  chQuery,
  createSqlBuilder,
  db,
  formatClickhouseDate,
  getSelectPropertyKey,
  TABLE_NAMES,
  toDate,
} from '@openpanel/db';
import { zChartInput, zRange, zTimeInterval } from '@openpanel/validation';

import { getProjectAccessCached } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import {
  getChart,
  getChartPrevStartEndDate,
  getChartStartEndDate,
  getFunnelData,
  getFunnelStep,
} from './chart.helpers';

export const chartRouter = createTRPCRouter({
  events: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        range: zRange,
        interval: zTimeInterval,
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
      })
    )
    .query(async ({ input: { projectId, ...input } }) => {
      const { startDate, endDate } = getChartStartEndDate(input);
      const events = await chQuery<{ name: string }>(
        `SELECT DISTINCT name FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} AND ${toDate('created_at', input.interval)} BETWEEN ${toDate(formatClickhouseDate(startDate), input.interval)} AND ${toDate(formatClickhouseDate(endDate), input.interval)};`
      );

      return [
        {
          name: '*',
        },
        ...events,
      ];
    }),

  properties: protectedProcedure
    .input(
      z.object({
        event: z.string().optional(),
        projectId: z.string(),
        range: zRange,
        interval: zTimeInterval,
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
      })
    )
    .query(async ({ input: { projectId, event, ...input } }) => {
      const { startDate, endDate } = getChartStartEndDate(input);
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from ${TABLE_NAMES.events} where ${
          event && event !== '*' ? `name = ${escape(event)} AND ` : ''
        } project_id = ${escape(projectId)} AND
        ${toDate('created_at', input.interval)} BETWEEN ${toDate(formatClickhouseDate(startDate), input.interval)} AND ${toDate(formatClickhouseDate(endDate), input.interval)};`
      );

      const properties = events
        .flatMap((event) => event.keys)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      properties.push(
        'has_profile',
        'name',
        'path',
        'origin',
        'referrer',
        'referrer_name',
        'duration',
        'created_at',
        'country',
        'city',
        'region',
        'os',
        'os_version',
        'browser',
        'browser_version',
        'device',
        'brand',
        'model'
      );

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq
      )(properties);
    }),

  values: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
        range: zRange,
        interval: zTimeInterval,
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
      })
    )
    .query(async ({ input: { event, property, projectId, ...input } }) => {
      const { startDate, endDate } = getChartStartEndDate(input);
      if (property === 'has_profile') {
        return {
          values: ['true', 'false'],
        };
      }

      const { sb, getSql } = createSqlBuilder();
      sb.where.project_id = `project_id = ${escape(projectId)}`;
      if (event !== '*') {
        sb.where.event = `name = ${escape(event)}`;
      }
      sb.select.values = `distinct ${getSelectPropertyKey(property)} as values`;
      sb.where.date = `${toDate('created_at', input.interval)} BETWEEN ${toDate(formatClickhouseDate(startDate), input.interval)} AND ${toDate(formatClickhouseDate(endDate), input.interval)};`;

      const events = await chQuery<{ values: string[] }>(getSql());

      const values = pipe(
        (data: typeof events) => map(prop('values'), data),
        flatten,
        uniq,
        sort((a, b) => a.length - b.length)
      )(events);

      return {
        values,
      };
    }),

  funnel: protectedProcedure.input(zChartInput).query(async ({ input }) => {
    const currentPeriod = getChartStartEndDate(input);
    const previousPeriod = getChartPrevStartEndDate({
      range: input.range,
      ...currentPeriod,
    });

    const [current, previous] = await Promise.all([
      getFunnelData({ ...input, ...currentPeriod }),
      getFunnelData({ ...input, ...previousPeriod }),
    ]);

    return {
      current,
      previous,
    };
  }),

  funnelStep: protectedProcedure
    .input(
      zChartInput.extend({
        step: z.number(),
      })
    )
    .query(async ({ input }) => {
      const currentPeriod = getChartStartEndDate(input);
      return getFunnelStep({ ...input, ...currentPeriod });
    }),

  chart: publicProcedure.input(zChartInput).query(async ({ input, ctx }) => {
    if (ctx.session.userId) {
      const access = await getProjectAccessCached({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        const share = await db.shareOverview.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!share) {
          throw TRPCAccessError('You do not have access to this project');
        }
      }
    } else {
      const share = await db.shareOverview.findFirst({
        where: {
          projectId: input.projectId,
        },
      });

      if (!share) {
        throw TRPCAccessError('You do not have access to this project');
      }
    }

    return getChart(input);
  }),
});
