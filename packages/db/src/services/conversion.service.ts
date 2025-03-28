import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartInput } from '@openpanel/validation';
import { omit } from 'ramda';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import {
  getEventFiltersWhereClause,
  getSelectPropertyKey,
} from './chart.service';

export class ConversionService {
  constructor(private client: typeof ch) {}

  async getConversion({
    projectId,
    startDate,
    endDate,
    funnelGroup,
    funnelWindow = 24,
    events,
    breakdowns = [],
    interval,
  }: Omit<IChartInput, 'range' | 'previous' | 'metric' | 'chartType'>) {
    const group = funnelGroup === 'profile_id' ? 'profile_id' : 'session_id';
    const breakdownColumns = breakdowns.map(
      (b, index) => `${getSelectPropertyKey(b.name)} as b_${index}`,
    );
    const breakdownGroupBy = breakdowns.map((b, index) => `b_${index}`);

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

    const eventACte = clix(this.client)
      .select([
        `DISTINCT ${group}`,
        'created_at AS a_time',
        `${clix.toStartOf('created_at', interval)} AS event_day`,
        ...breakdownColumns,
      ])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('name', '=', eventA.name)
      .rawWhere(whereA)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ]);

    const eventBCte = clix(this.client)
      .select([group, 'created_at AS b_time'])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('name', '=', eventB.name)
      .rawWhere(whereB)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ]);

    const query = clix(this.client)
      .with('event_a', eventACte)
      .with('event_b', eventBCte)
      .select<{
        event_day: string;
        total_first: number;
        conversions: number;
        conversion_rate_percentage: number;
        [key: string]: string | number; // For breakdown columns
      }>([
        'event_day',
        ...breakdownGroupBy,
        'count(*) AS total_first',
        'sum(if(conversion_time IS NOT NULL, 1, 0)) AS conversions',
        'round(100.0 * sum(if(conversion_time IS NOT NULL, 1, 0)) / count(*), 2) AS conversion_rate_percentage',
      ])
      .from(
        clix.exp(`
        (SELECT 
          a.${group},
          a.a_time,
          a.event_day,
          ${breakdownGroupBy.length ? `${breakdownGroupBy.join(', ')},` : ''}
          nullIf(min(b.b_time), '1970-01-01 00:00:00.000') AS conversion_time
        FROM event_a AS a
        LEFT JOIN event_b AS b ON a.${group} = b.${group}
          AND b.b_time BETWEEN a.a_time AND a.a_time + INTERVAL ${funnelWindow} HOUR
        GROUP BY a.${group}, a.a_time, a.event_day${breakdownGroupBy.length ? `, ${breakdownGroupBy.join(', ')}` : ''})
      `),
      )
      .groupBy(['event_day', ...breakdownGroupBy]);

    for (const order of ['event_day', ...breakdownGroupBy]) {
      query.orderBy(order);
    }

    const results = await query.execute();
    return this.toSeries(results, breakdowns).map((serie, serieIndex) => {
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
    });
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
