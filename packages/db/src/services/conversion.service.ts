import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IReportInput } from '@openpanel/validation';
import { omit } from 'ramda';
import sqlstring from 'sqlstring';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import {
  getEventFiltersWhereClause,
  getSelectPropertyKey,
} from './chart.service';
import { onlyReportEvents } from './reports.service';

export class ConversionService {
  constructor(private client: typeof ch) {}

  async getConversion({
    projectId,
    startDate,
    endDate,
    options,
    series,
    breakdowns = [],
    limit,
    interval,
    timezone,
  }: Omit<IReportInput, 'range' | 'previous' | 'metric' | 'chartType'> & {
    timezone: string;
  }) {
    const funnelOptions = options?.type === 'funnel' ? options : undefined;
    const funnelGroup = funnelOptions?.funnelGroup;
    const funnelWindow = funnelOptions?.funnelWindow ?? 24;
    const group = funnelGroup === 'profile_id' ? 'profile_id' : 'session_id';
    const breakdownExpressions = breakdowns.map(
      (b) => getSelectPropertyKey(b.name),
    );
    const breakdownSelects = breakdownExpressions.map(
      (expr, index) => `${expr} as b_${index}`,
    );
    const breakdownGroupBy = breakdowns.map((_, index) => `b_${index}`);

    // Check if any breakdown uses profile fields and build profile JOIN if needed
    const profileBreakdowns = breakdowns.filter((b) =>
      b.name.startsWith('profile.'),
    );
    const needsProfileJoin = profileBreakdowns.length > 0;

    // Build profile JOIN clause if needed
    let profileJoin = '';
    if (needsProfileJoin) {
      const profileFields = new Set<string>();
      profileFields.add('id');

      for (const b of profileBreakdowns) {
        const fieldName = b.name.replace('profile.', '').split('.')[0];
        if (fieldName === 'properties') {
          profileFields.add('properties');
        } else if (['email', 'first_name', 'last_name'].includes(fieldName!)) {
          profileFields.add(fieldName!);
        }
      }

      // Use simple column names (not aliased) so profile.properties works directly
      const selectFields = Array.from(profileFields);

      profileJoin = `LEFT ANY JOIN (
        SELECT ${selectFields.join(', ')}
        FROM ${TABLE_NAMES.profiles} FINAL
        WHERE project_id = ${sqlstring.escape(projectId)}
      ) as profile ON profile.id = profile_id`;
    }

    const events = onlyReportEvents(series);

    if (events.length !== 2) {
      throw new Error('events must be an array of two events');
    }

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const eventA = events[0]!;
    const eventB = events[1]!;
    const whereA = Object.values(
      getEventFiltersWhereClause(eventA.filters),
    ).join(' AND ');
    const whereB = Object.values(
      getEventFiltersWhereClause(eventB.filters),
    ).join(' AND ');

    const funnelWindowSeconds = funnelWindow * 3600;

    // Build funnel conditions
    const conditionA = whereA
      ? `(name = '${eventA.name}' AND ${whereA})`
      : `name = '${eventA.name}'`;
    const conditionB = whereB
      ? `(name = '${eventB.name}' AND ${whereB})`
      : `name = '${eventB.name}'`;

    // Use windowFunnel approach - single scan, no JOIN
    const query = clix(this.client, timezone)
      .select<{
        event_day: string;
        total_first: number;
        conversions: number;
        conversion_rate_percentage: number;
        [key: string]: string | number;
      }>([
        'event_day',
        ...breakdownGroupBy,
        `uniqExact(${group}) AS total_first`,
        'countIf(steps >= 2) AS conversions',
        `round(100.0 * countIf(steps >= 2) / uniqExact(${group}), 2) AS conversion_rate_percentage`,
      ])
      .from(
        clix.exp(`
        (SELECT
          ${group},
          any(${clix.toStartOf('created_at', interval)}) as event_day,
          ${breakdownSelects.length ? `${breakdownSelects.join(', ')},` : ''}
          windowFunnel(${funnelWindowSeconds})(
            toDateTime(created_at),
            ${conditionA},
            ${conditionB}
          ) as steps
        FROM ${TABLE_NAMES.events}
        ${profileJoin}
        WHERE project_id = '${projectId}'
          AND name IN ('${eventA.name}', '${eventB.name}')
          AND created_at BETWEEN toDateTime('${startDate}') AND toDateTime('${endDate}')
        GROUP BY ${group}${breakdownExpressions.length ? `, ${breakdownExpressions.join(', ')}` : ''})
      `),
      )
      .where('steps', '>', 0)
      .groupBy(['event_day', ...breakdownGroupBy]);

    for (const order of ['event_day', ...breakdownGroupBy]) {
      query.orderBy(order);
    }

    const results = await query.execute();
    return this.toSeries(results, breakdowns, limit).map(
      (serie, serieIndex) => {
        return {
          ...serie,
          data: serie.data.map((d, index) => ({
            ...d,
            timestamp: new Date(d.date).getTime(),
            serieIndex,
            index,
            serie: omit(['data'], serie),
          })),
        };
      },
    );
  }

  private toSeries(
    data: {
      event_day: string;
      total_first: number;
      conversions: number;
      conversion_rate_percentage: number;
      [key: string]: string | number;
    }[],
    breakdowns: { name: string }[] = [],
    limit: number | undefined = undefined,
  ) {
    if (!breakdowns.length) {
      return [
        {
          id: 'conversion',
          breakdowns: [],
          data: data.map((d) => ({
            date: d.event_day,
            total: d.total_first,
            conversions: d.conversions,
            rate: d.conversion_rate_percentage,
          })),
        },
      ];
    }

    // Group by breakdown values
    const series = data.reduce(
      (acc, d) => {
        if (limit && Object.keys(acc).length >= limit) {
          return acc;
        }

        const key =
          breakdowns.map((b, index) => d[`b_${index}`]).join('|') ||
          NOT_SET_VALUE;
        if (!acc[key]) {
          acc[key] = {
            id: key,
            breakdowns: breakdowns.map(
              (b, index) => (d[`b_${index}`] || NOT_SET_VALUE) as string,
            ),
            data: [],
          };
        }
        acc[key]!.data.push({
          date: d.event_day,
          total: d.total_first,
          conversions: d.conversions,
          rate: d.conversion_rate_percentage,
        });
        return acc;
      },
      {} as Record<
        string,
        {
          id: string;
          breakdowns: string[];
          data: {
            date: string;
            total: number;
            conversions: number;
            rate: number;
          }[];
        }
      >,
    );

    return Object.values(series).map((serie, serieIndex) => ({
      ...serie,
      data: serie.data.map((item, dataIndex) => ({
        ...item,
        dataIndex,
        serieIndex,
      })),
    }));
  }
}

export const conversionService = new ConversionService(ch);
