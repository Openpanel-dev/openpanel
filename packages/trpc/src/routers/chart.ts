import { flatten, map, pipe, prop, range, sort, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { z } from 'zod';

import {
  type IClickhouseProfile,
  type IServiceProfile,
  TABLE_NAMES,
  ch,
  chQuery,
  clix,
  conversionService,
  createSqlBuilder,
  db,
  formatClickhouseDate,
  funnelService,
  getChartPrevStartEndDate,
  getChartStartEndDate,
  getEventFiltersWhereClause,
  getEventMetasCached,
  getProfilesCached,
  getSelectPropertyKey,
  getSettingsForProject,
  onlyReportEvents,
  sankeyService,
} from '@openpanel/db';
import {
  type IChartEvent,
  zChartInput,
  zChartSeries,
  zCriteria,
  zRange,
  zTimeInterval,
} from '@openpanel/validation';

import { round } from '@openpanel/common';
import { AggregateChartEngine, ChartEngine } from '@openpanel/db';
import {
  differenceInDays,
  differenceInMonths,
  differenceInWeeks,
  formatISO,
} from 'date-fns';
import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import {
  cacheMiddleware,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../trpc';

function utc(date: string | Date) {
  if (typeof date === 'string') {
    return date.replace('T', ' ').slice(0, 19);
  }
  return formatISO(date).replace('T', ' ').slice(0, 19);
}

const cacher = cacheMiddleware(60);

export const chartRouter = createTRPCRouter({
  projectCard: protectedProcedure
    .use(cacheMiddleware(60 * 5))
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { projectId } }) => {
      const { timezone } = await getSettingsForProject(projectId);
      const chartPromise = chQuery<{
        value: number;
        date: Date;
        revenue: number;
      }>(
        `SELECT
            uniqHLL12(profile_id) as value,
            toStartOfDay(created_at) as date,
            sum(revenue * sign) as revenue
        FROM ${TABLE_NAMES.sessions}
        WHERE 
            project_id = ${sqlstring.escape(projectId)} AND 
            created_at >= now() - interval '3 month'
        GROUP BY date
        ORDER BY date ASC
        WITH FILL FROM toStartOfDay(now() - interval '1 month') 
        TO toStartOfDay(now()) 
        STEP INTERVAL 1 day
        SETTINGS session_timezone = '${timezone}'
      `,
      );

      const metricsPromise = clix(ch, timezone)
        .select<{
          months_3: number;
          months_3_prev: number;
          month: number;
          day: number;
          day_prev: number;
          revenue: number;
        }>([
          'uniqHLL12(if(created_at >= (now() - toIntervalMonth(3)), profile_id, null)) AS months_3',
          'uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)) AND created_at < (now() - toIntervalMonth(3)), profile_id, null)) AS months_3_prev',
          'uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month',
          'uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day',
          'uniqHLL12(if(created_at >= (now() - toIntervalDay(2)) AND created_at < (now() - toIntervalDay(1)), profile_id, null)) AS day_prev',
          'sum(revenue * sign) as revenue',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', projectId)
        .where('created_at', '>=', clix.exp('now() - toIntervalMonth(6)'))
        .execute();

      const [chart, [metrics]] = await Promise.all([
        chartPromise,
        metricsPromise,
      ]);

      const change =
        metrics && metrics.months_3_prev > 0 && metrics.months_3 > 0
          ? Math.round(
              ((metrics.months_3 - metrics.months_3_prev) /
                metrics.months_3_prev) *
                100,
            )
          : null;

      const trend =
        change === null
          ? { direction: 'neutral' as const, percentage: null as number | null }
          : change > 0
            ? { direction: 'up' as const, percentage: change }
            : change < 0
              ? { direction: 'down' as const, percentage: Math.abs(change) }
              : { direction: 'neutral' as const, percentage: 0 };

      return {
        chart: chart.map((d) => ({ ...d, date: new Date(d.date) })),
        metrics,
        trend,
      };
    }),

  events: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { projectId } }) => {
      const [events, meta] = await Promise.all([
        chQuery<{ name: string; count: number }>(
          `SELECT name, count(name) as count FROM ${TABLE_NAMES.event_names_mv} WHERE project_id = ${sqlstring.escape(projectId)} GROUP BY name ORDER BY count DESC, name ASC`,
        ),
        getEventMetasCached(projectId),
      ]);

      return [
        {
          name: '*',
          count: events.reduce((acc, event) => acc + event.count, 0),
          meta: undefined,
        },
        ...events.map((event) => ({
          name: event.name,
          count: event.count,
          meta: meta.find((m) => m.name === event.name),
        })),
      ];
    }),

  properties: protectedProcedure
    .input(
      z.object({
        event: z.string().optional(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { projectId, event } }) => {
      const profiles = await clix(ch, 'UTC')
        .select<Pick<IServiceProfile, 'properties'>>(['properties'])
        .from(TABLE_NAMES.profiles)
        .where('project_id', '=', projectId)
        .where('is_external', '=', true)
        .orderBy('created_at', 'DESC')
        .limit(10000)
        .execute();

      const profileProperties: string[] = [];
      for (const p of profiles) {
        for (const property of Object.keys(p.properties)) {
          if (!profileProperties.includes(`profile.properties.${property}`)) {
            profileProperties.push(`profile.properties.${property}`);
          }
        }
      }

      const query = clix(ch)
        .select<{ property_key: string; created_at: string }>([
          'distinct property_key',
          'max(created_at) as created_at',
        ])
        .from(TABLE_NAMES.event_property_values_mv)
        .where('project_id', '=', projectId)
        .groupBy(['property_key'])
        .orderBy('created_at', 'DESC');

      if (event && event !== '*') {
        query.where('name', '=', event);
      }

      const res = await query.execute();

      const properties = res
        .map((item) => item.property_key)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      if (event === '*' || !event) {
        properties.push('name');
      }

      properties.push(
        'revenue',
        'has_profile',
        'path',
        'origin',
        'referrer',
        'referrer_name',
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
        'model',
        'profile.id',
        'profile.first_name',
        'profile.last_name',
        'profile.email',
        ...profileProperties,
      );

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq,
      )(properties);
    }),

  values: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { event, property, projectId, ...input } }) => {
      if (property === 'has_profile') {
        return {
          values: ['true', 'false'],
        };
      }

      const values: string[] = [];

      if (property.startsWith('properties.')) {
        const query = clix(ch)
          .select<{
            property_value: string;
            created_at: string;
          }>(['distinct property_value', 'max(created_at) as created_at'])
          .from(TABLE_NAMES.event_property_values_mv)
          .where('project_id', '=', projectId)
          .where('property_key', '=', property.replace(/^properties\./, ''))
          .groupBy(['property_value'])
          .orderBy('created_at', 'DESC');

        if (event && event !== '*') {
          query.where('name', '=', event);
        }

        const res = await query.execute();

        values.push(...res.map((e) => e.property_value));
      } else {
        const query = clix(ch)
          .select<{ values: string[] }>([
            `distinct ${getSelectPropertyKey(property)} as values`,
          ])
          .from(TABLE_NAMES.events)
          .where('project_id', '=', projectId)
          .where('created_at', '>', clix.exp('now() - INTERVAL 6 MONTH'))
          .orderBy('created_at', 'DESC')
          .limit(100_000);

        if (event !== '*') {
          query.where('name', '=', event);
        }

        if (property.startsWith('profile.')) {
          query.leftAnyJoin(
            clix(ch)
              .select<IClickhouseProfile>([])
              .from(TABLE_NAMES.profiles)
              .where('project_id', '=', projectId),
            'profile.id = profile_id',
            'profile',
          );
        }

        const events = await query.execute();

        values.push(
          ...pipe(
            (data: typeof events) => map(prop('values'), data),
            flatten,
            uniq,
            sort((a, b) => a.length - b.length),
          )(events),
        );
      }

      return {
        values,
      };
    }),

  funnel: protectedProcedure.input(zChartInput).query(async ({ input }) => {
    const { timezone } = await getSettingsForProject(input.projectId);
    const currentPeriod = getChartStartEndDate(input, timezone);
    const previousPeriod = getChartPrevStartEndDate(currentPeriod);

    const [current, previous] = await Promise.all([
      funnelService.getFunnel({ ...input, ...currentPeriod, timezone }),
      input.previous
        ? funnelService.getFunnel({ ...input, ...previousPeriod, timezone })
        : Promise.resolve(null),
    ]);

    return {
      current,
      previous,
    };
  }),

  conversion: protectedProcedure.input(zChartInput).query(async ({ input }) => {
    const { timezone } = await getSettingsForProject(input.projectId);
    const currentPeriod = getChartStartEndDate(input, timezone);
    const previousPeriod = getChartPrevStartEndDate(currentPeriod);

    const [current, previous] = await Promise.all([
      conversionService.getConversion({ ...input, ...currentPeriod, timezone }),
      input.previous
        ? conversionService.getConversion({
            ...input,
            ...previousPeriod,
            timezone,
          })
        : Promise.resolve(null),
    ]);

    return {
      current: current.map((serie, sIndex) => ({
        ...serie,
        data: serie.data.map((d, dIndex) => ({
          ...d,
          previousRate: previous?.[sIndex]?.data?.[dIndex]?.rate,
        })),
      })),
      previous,
    };
  }),

  sankey: protectedProcedure.input(zChartInput).query(async ({ input }) => {
    const { timezone } = await getSettingsForProject(input.projectId);
    const currentPeriod = getChartStartEndDate(input, timezone);

    // Extract sankey options
    const options = input.options;

    if (!options || options.type !== 'sankey') {
      throw new Error('Sankey options are required');
    }

    // Extract start/end events from series based on mode
    const eventSeries = onlyReportEvents(input.series);

    if (!eventSeries[0]) {
      throw new Error('Start and end events are required');
    }

    return sankeyService.getSankey({
      projectId: input.projectId,
      startDate: currentPeriod.startDate,
      endDate: currentPeriod.endDate,
      steps: options.steps,
      mode: options.mode,
      startEvent: eventSeries[0],
      endEvent: eventSeries[1],
      exclude: options.exclude || [],
      include: options.include,
      timezone,
    });
  }),

  chart: publicProcedure
    // .use(cacher)
    .input(zChartInput)
    .query(async ({ input, ctx }) => {
      if (ctx.session.userId) {
        const access = await getProjectAccess({
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

      // Use new chart engine
      return ChartEngine.execute(input);
    }),

  aggregate: publicProcedure
    .input(zChartInput)
    .query(async ({ input, ctx }) => {
      if (ctx.session.userId) {
        const access = await getProjectAccess({
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

      // Use aggregate chart engine (optimized for bar/pie charts)
      return AggregateChartEngine.execute(input);
    }),

  cohort: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        firstEvent: z.array(z.string()).min(1),
        secondEvent: z.array(z.string()).min(1),
        criteria: zCriteria.default('on_or_after'),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        interval: zTimeInterval.default('day'),
        range: zRange,
      }),
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { projectId, firstEvent, secondEvent } = input;
      const dates = getChartStartEndDate(input, timezone);
      const diffInterval = {
        minute: () => differenceInDays(dates.endDate, dates.startDate),
        hour: () => differenceInDays(dates.endDate, dates.startDate),
        day: () => differenceInDays(dates.endDate, dates.startDate),
        week: () => differenceInWeeks(dates.endDate, dates.startDate),
        month: () => differenceInMonths(dates.endDate, dates.startDate),
      }[input.interval]();
      const sqlInterval = {
        minute: 'DAY',
        hour: 'DAY',
        day: 'DAY',
        week: 'WEEK',
        month: 'MONTH',
      }[input.interval];

      const sqlToStartOf = {
        minute: 'toDate',
        hour: 'toDate',
        day: 'toDate',
        week: 'toStartOfWeek',
        month: 'toStartOfMonth',
      }[input.interval];

      const countCriteria = input.criteria === 'on_or_after' ? '>=' : '=';

      const usersSelect = range(0, diffInterval + 1)
        .map(
          (index) =>
            `groupUniqArrayIf(profile_id, x_after_cohort ${countCriteria} ${index}) AS interval_${index}_users`,
        )
        .join(',\n');

      const countsSelect = range(0, diffInterval + 1)
        .map(
          (index) =>
            `length(interval_${index}_users) AS interval_${index}_user_count`,
        )
        .join(',\n');

      const whereEventNameIs = (event: string[]) => {
        if (event.length === 1) {
          return `name = ${sqlstring.escape(event[0])}`;
        }
        return `name IN (${event.map((e) => sqlstring.escape(e)).join(',')})`;
      };

      const cohortQuery = `
        WITH 
        cohort_users AS (
          SELECT
            profile_id AS userID,
            project_id,
            ${sqlToStartOf}(created_at) AS cohort_interval
          FROM ${TABLE_NAMES.cohort_events_mv}
          WHERE ${whereEventNameIs(firstEvent)}
            AND project_id = ${sqlstring.escape(projectId)}
            AND created_at BETWEEN toDate('${utc(dates.startDate)}') AND toDate('${utc(dates.endDate)}')
        ),
        last_event AS
        (
            SELECT
                profile_id,
                project_id,
                toDate(created_at) AS event_date
            FROM cohort_events_mv
            WHERE ${whereEventNameIs(secondEvent)}
            AND project_id = ${sqlstring.escape(projectId)}
            AND created_at BETWEEN toDate('${utc(dates.startDate)}') AND toDate('${utc(dates.endDate)}') + INTERVAL ${diffInterval} ${sqlInterval}
        ),
        retention_matrix AS
        (
          SELECT
              f.cohort_interval,
              l.profile_id,
              dateDiff('${sqlInterval}', f.cohort_interval, ${sqlToStartOf}(l.event_date)) AS x_after_cohort
          FROM cohort_users AS f
          INNER JOIN last_event AS l ON f.userID = l.profile_id
          WHERE (l.event_date >= f.cohort_interval) 
          AND (l.event_date <= (f.cohort_interval + INTERVAL ${diffInterval} ${sqlInterval}))
        ),
        interval_users AS (
          SELECT
            cohort_interval,
            ${usersSelect}
          FROM retention_matrix
          GROUP BY cohort_interval
        ),
        cohort_sizes AS (
          SELECT
            cohort_interval,
            COUNT(DISTINCT userID) AS total_first_event_count
          FROM cohort_users
          GROUP BY cohort_interval
        )
        SELECT
          cohort_interval,
          cohort_sizes.total_first_event_count,
          ${countsSelect}
        FROM interval_users
        LEFT JOIN cohort_sizes AS cs ON cohort_interval = cs.cohort_interval
        ORDER BY cohort_interval ASC
      `;

      const cohortData = await chQuery<{
        cohort_interval: string;
        total_first_event_count: number;
        [key: string]: any;
      }>(cohortQuery);

      return processCohortData(cohortData, diffInterval);
    }),

  getProfiles: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string().describe('The date for the data point (ISO string)'),
        interval: zTimeInterval.default('day'),
        series: zChartSeries,
        breakdowns: z.record(z.string(), z.string()).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const { projectId, date, series } = input;
      const limit = 100;
      const serie = series[0];

      if (!serie) {
        throw new Error('Series not found');
      }

      if (serie.type !== 'event') {
        throw new Error('Series must be an event');
      }

      // Build the date range for the specific interval bucket
      const dateObj = new Date(date);
      // Build query to get unique profile_ids for this time bucket
      const { sb, getSql } = createSqlBuilder();

      sb.select.profile_id = 'DISTINCT profile_id';
      sb.where = getEventFiltersWhereClause(serie.filters);
      sb.where.projectId = `project_id = ${sqlstring.escape(projectId)}`;
      sb.where.dateRange = `${clix.toStartOf('created_at', input.interval)} = ${clix.toDate(sqlstring.escape(formatClickhouseDate(dateObj)), input.interval)}`;
      if (serie.name !== '*') {
        sb.where.eventName = `name = ${sqlstring.escape(serie.name)}`;
      }

      // Collect profile fields from filters and breakdowns
      const profileFields = [
        ...serie.filters
          .filter((f) => f.name.startsWith('profile.'))
          .map((f) => f.name.replace('profile.', '')),
        ...(input.breakdowns
          ? Object.keys(input.breakdowns)
              .filter((key) => key.startsWith('profile.'))
              .map((key) => key.replace('profile.', ''))
          : []),
      ];

      if (profileFields.length > 0) {
        // Extract top-level field names and select only what's needed
        const fieldsToSelect = uniq(
          profileFields.map((f) => f.split('.')[0]),
        ).join(', ');
        sb.joins.profiles = `LEFT ANY JOIN (SELECT id, ${fieldsToSelect} FROM ${TABLE_NAMES.profiles} FINAL WHERE project_id = ${sqlstring.escape(projectId)}) as profile on profile.id = profile_id`;
      }

      if (input.breakdowns) {
        Object.entries(input.breakdowns).forEach(([key, value]) => {
          // Transform property keys (e.g., properties.method -> properties['method'])
          const propertyKey = getSelectPropertyKey(key);
          sb.where[`breakdown_${key}`] =
            `${propertyKey} = ${sqlstring.escape(value)}`;
        });
      }

      // Get unique profile IDs
      const profileIds = await chQuery<{ profile_id: string }>(getSql());
      if (profileIds.length === 0) {
        return [];
      }

      // Fetch profile details
      const ids = profileIds.map((p) => p.profile_id).filter(Boolean);
      const profiles = await getProfilesCached(ids, projectId);

      return profiles;
    }),

  getFunnelProfiles: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        series: zChartSeries,
        stepIndex: z.number().describe('0-based index of the funnel step'),
        showDropoffs: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, show users who dropped off at this step. If false, show users who completed at least this step.',
          ),
        funnelWindow: z.number().optional(),
        funnelGroup: z.string().optional(),
        breakdowns: z.array(z.object({ name: z.string() })).optional(),
        range: zRange,
      }),
    )
    .query(async ({ input }) => {
      const { timezone } = await getSettingsForProject(input.projectId);
      const {
        projectId,
        series,
        stepIndex,
        showDropoffs = false,
        funnelWindow,
        funnelGroup,
        breakdowns = [],
      } = input;

      const { startDate, endDate } = getChartStartEndDate(input, timezone);

      // stepIndex is 0-based, but level is 1-based, so we need level >= stepIndex + 1
      const targetLevel = stepIndex + 1;

      const eventSeries = onlyReportEvents(series);

      if (eventSeries.length === 0) {
        throw new Error('At least one event series is required');
      }

      const funnelWindowSeconds = (funnelWindow || 24) * 3600;
      const funnelWindowMilliseconds = funnelWindowSeconds * 1000;

      // Use funnel service methods
      const group = funnelService.getFunnelGroup(funnelGroup);

      // Create sessions CTE if needed
      const sessionsCte =
        group[0] !== 'session_id'
          ? funnelService.buildSessionsCte({
              projectId,
              startDate,
              endDate,
              timezone,
            })
          : null;

      // Create funnel CTE using funnel service
      const funnelCte = funnelService.buildFunnelCte({
        projectId,
        startDate,
        endDate,
        eventSeries: eventSeries as IChartEvent[],
        funnelWindowMilliseconds,
        group,
        timezone,
        additionalSelects: ['profile_id'],
        additionalGroupBy: ['profile_id'],
      });

      // Check for profile filters and add profile join if needed
      const profileFilters = funnelService.getProfileFilters(
        eventSeries as IChartEvent[],
      );
      if (profileFilters.length > 0) {
        const fieldsToSelect = uniq(
          profileFilters.map((f) => f.split('.')[0]),
        ).join(', ');
        funnelCte.leftJoin(
          `(SELECT id, ${fieldsToSelect} FROM ${TABLE_NAMES.profiles} FINAL WHERE project_id = ${sqlstring.escape(projectId)}) as profile`,
          'profile.id = events.profile_id',
        );
      }

      // Build main query
      const query = clix(ch, timezone);

      if (sessionsCte) {
        funnelCte.leftJoin('sessions s', 's.sid = events.session_id');
        query.with('sessions', sessionsCte);
      }

      query.with('funnel', funnelCte);

      // Get distinct profile IDs
      query
        .select(['DISTINCT profile_id'])
        .from('funnel')
        .where('level', '!=', 0);

      if (showDropoffs) {
        // Show users who dropped off at this step (completed this step but not the next)
        query.where('level', '=', targetLevel);
      } else {
        // Show users who completed at least this step
        query.where('level', '>=', targetLevel);
      }

      const profileIdsResult = (await query.execute()) as {
        profile_id: string;
      }[];

      if (profileIdsResult.length === 0) {
        return [];
      }

      // Fetch profile details
      const ids = profileIdsResult.map((p) => p.profile_id).filter(Boolean);
      const profiles = await getProfilesCached(ids, projectId);

      return profiles;
    }),
});

function processCohortData(
  data: Array<{
    cohort_interval: string;
    total_first_event_count: number;
    [key: string]: any;
  }>,
  diffInterval: number,
) {
  if (data.length === 0) {
    return [];
  }

  const processed = data.map((row) => {
    const sum = row.total_first_event_count;
    const values = range(0, diffInterval + 1).map(
      (index) => (row[`interval_${index}_user_count`] || 0) as number,
    );

    return {
      cohort_interval: row.cohort_interval,
      sum,
      values: values,
      percentages: values.map((value) => (sum > 0 ? round(value / sum, 2) : 0)),
    };
  });

  const averageData: {
    totalSum: number;
    values: Array<{ sum: number; weightedSum: number }>;
    percentages: Array<{ sum: number; weightedSum: number }>;
  } = {
    totalSum: 0,
    values: range(0, diffInterval + 1).map(() => ({ sum: 0, weightedSum: 0 })),
    percentages: range(0, diffInterval + 1).map(() => ({
      sum: 0,
      weightedSum: 0,
    })),
  };

  // Aggregate data for weighted averages, excluding zeros
  processed.forEach((row) => {
    averageData.totalSum += row.sum;
    row.values.forEach((value, index) => {
      if (value !== 0) {
        averageData.values[index]!.sum += row.sum;
        averageData.values[index]!.weightedSum += value * row.sum;
      }
    });
    row.percentages.forEach((percentage, index) => {
      if (percentage !== 0) {
        averageData.percentages[index]!.sum += row.sum;
        averageData.percentages[index]!.weightedSum += percentage * row.sum;
      }
    });
  });

  // Calculate weighted average values, excluding zeros
  const averageRow = {
    cohort_interval: 'Weighted Average',
    sum: round(averageData.totalSum / processed.length, 0),
    percentages: averageData.percentages.map(({ sum, weightedSum }) =>
      sum > 0 ? round(weightedSum / sum, 2) : 0,
    ),
    values: averageData.values.map(({ sum, weightedSum }) =>
      sum > 0 ? round(weightedSum / sum, 0) : 0,
    ),
  };

  return [averageRow, ...processed];
}
