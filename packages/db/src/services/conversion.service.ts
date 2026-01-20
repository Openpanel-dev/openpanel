import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { omit } from 'ramda';
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
    funnelGroup,
    funnelWindow = 24,
    series,
    breakdowns = [],
    limit,
    interval,
    timezone,
  }: Omit<IChartInput, 'range' | 'previous' | 'metric' | 'chartType'> & {
    timezone: string;
  }) {
    const group = funnelGroup === 'profile_id' ? 'profile_id' : 'session_id';
    const breakdownColumns = breakdowns.map(
      (b, index) => `${getSelectPropertyKey(b.name)} as b_${index}`,
    );
    const breakdownGroupBy = breakdowns.map((b, index) => `b_${index}`);

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
    const conditionA = whereA ? `(name = '${eventA.name}' AND ${whereA})` : `name = '${eventA.name}'`;
    const conditionB = whereB ? `(name = '${eventB.name}' AND ${whereB})` : `name = '${eventB.name}'`;

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
        `countIf(steps >= 2) AS conversions`,
        `round(100.0 * countIf(steps >= 2) / uniqExact(${group}), 2) AS conversion_rate_percentage`,
      ])
      .from(
        clix.exp(`
        (SELECT
          ${group},
          any(${clix.toStartOf('created_at', interval)}) as event_day,
          ${breakdownGroupBy.length ? `${breakdownGroupBy.map(b => `any(${b}) as ${b}`).join(', ')},` : ''}
          windowFunnel(${funnelWindowSeconds})(
            toDateTime(created_at),
            ${conditionA},
            ${conditionB}
          ) as steps
        FROM ${TABLE_NAMES.events}
        WHERE project_id = '${projectId}'
          AND name IN ('${eventA.name}', '${eventB.name}')
          AND created_at BETWEEN toDateTime('${startDate}') AND toDateTime('${endDate}')
        GROUP BY ${group}${breakdownGroupBy.length ? `, ${breakdownGroupBy.join(', ')}` : ''})
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
