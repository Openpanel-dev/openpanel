import { getDaysOldDate } from '@/utils/date';
import { round } from '@/utils/math';
import * as mathjs from 'mathjs';
import { sort } from 'ramda';

import { alphabetIds, NOT_SET_VALUE } from '@openpanel/constants';
import { chQuery, convertClickhouseDateToJs, getChartSql } from '@openpanel/db';
import type {
  IChartEvent,
  IChartInput,
  IChartRange,
  IGetChartDataInput,
  IInterval,
} from '@openpanel/validation';

export type GetChartDataResult = Awaited<ReturnType<typeof getChartData>>;
export interface ResultItem {
  label: string | null;
  count: number | null;
  date: string;
}

function getEventLegend(event: IChartEvent) {
  return event.displayName ?? `${event.name} (${event.id})`;
}

function fillEmptySpotsInTimeline(
  items: ResultItem[],
  interval: IInterval,
  startDate: string,
  endDate: string
) {
  const result = [];
  const clonedStartDate = new Date(startDate);
  const clonedEndDate = new Date(endDate);
  const today = new Date();

  if (interval === 'minute') {
    clonedStartDate.setUTCSeconds(0, 0);
    clonedEndDate.setUTCMinutes(clonedEndDate.getUTCMinutes() + 1, 0, 0);
  } else if (interval === 'hour') {
    clonedStartDate.setUTCMinutes(0, 0, 0);
    clonedEndDate.setUTCMinutes(0, 0, 0);
  } else {
    clonedStartDate.setUTCHours(0, 0, 0, 0);
    clonedEndDate.setUTCHours(0, 0, 0, 0);
  }

  if (interval === 'month') {
    clonedStartDate.setUTCDate(1);
    clonedEndDate.setUTCDate(1);
  }

  // Force if interval is month and the start date is the same month as today
  const shouldForce = () =>
    interval === 'month' &&
    clonedStartDate.getUTCFullYear() === today.getUTCFullYear() &&
    clonedStartDate.getUTCMonth() === today.getUTCMonth();
  let prev = undefined;
  while (
    shouldForce() ||
    clonedStartDate.getTime() <= clonedEndDate.getTime()
  ) {
    if (prev === clonedStartDate.getTime()) {
      break;
    }
    prev = clonedStartDate.getTime();

    const getYear = (date: Date) => date.getUTCFullYear();
    const getMonth = (date: Date) => date.getUTCMonth();
    const getDay = (date: Date) => date.getUTCDate();
    const getHour = (date: Date) => date.getUTCHours();
    const getMinute = (date: Date) => date.getUTCMinutes();

    const item = items.find((item) => {
      const date = convertClickhouseDateToJs(item.date);

      if (interval === 'month') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate)
        );
      }
      if (interval === 'day') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate)
        );
      }
      if (interval === 'hour') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate) &&
          getHour(date) === getHour(clonedStartDate)
        );
      }
      if (interval === 'minute') {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate) &&
          getHour(date) === getHour(clonedStartDate) &&
          getMinute(date) === getMinute(clonedStartDate)
        );
      }

      return false;
    });

    if (item) {
      result.push({
        ...item,
        date: clonedStartDate.toISOString(),
      });
    } else {
      result.push({
        date: clonedStartDate.toISOString(),
        count: 0,
        label: null,
      });
    }

    switch (interval) {
      case 'day': {
        clonedStartDate.setUTCDate(clonedStartDate.getUTCDate() + 1);
        break;
      }
      case 'hour': {
        clonedStartDate.setUTCHours(clonedStartDate.getUTCHours() + 1);
        break;
      }
      case 'minute': {
        clonedStartDate.setUTCMinutes(clonedStartDate.getUTCMinutes() + 1);
        break;
      }
      case 'month': {
        clonedStartDate.setUTCMonth(clonedStartDate.getUTCMonth() + 1);
        break;
      }
    }
  }

  return sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  }, result);
}

export function withFormula(
  { formula, events }: IChartInput,
  series: GetChartDataResult
) {
  if (!formula) {
    return series;
  }

  if (!series) {
    return series;
  }

  if (!series[0]) {
    return series;
  }
  if (!series[0].data) {
    return series;
  }

  if (events.length === 1) {
    return series.map((serie) => {
      return {
        ...serie,
        data: serie.data.map((item) => {
          serie.event.id;
          const scope = {
            [serie.event.id]: item?.count ?? 0,
          };

          const count = mathjs
            .parse(formula)
            .compile()
            .evaluate(scope) as number;

          return {
            ...item,
            count:
              Number.isNaN(count) || !Number.isFinite(count)
                ? null
                : round(count, 2),
          };
        }),
      };
    });
  }

  return [
    {
      ...series[0],
      data: series[0].data.map((item, dIndex) => {
        const scope = series.reduce((acc, item) => {
          return {
            ...acc,
            [item.event.id]: item.data[dIndex]?.count ?? 0,
          };
        }, {});

        const count = mathjs.parse(formula).compile().evaluate(scope) as number;
        return {
          ...item,
          count:
            Number.isNaN(count) || !Number.isFinite(count)
              ? null
              : round(count, 2),
        };
      }),
    },
  ];
}

export async function getChartData(payload: IGetChartDataInput) {
  let result = await chQuery<ResultItem>(getChartSql(payload));

  if (result.length === 0 && payload.breakdowns.length > 0) {
    result = await chQuery<ResultItem>(
      getChartSql({
        ...payload,
        breakdowns: [],
      })
    );
  }

  // group by sql label
  const series = result.reduce(
    (acc, item) => {
      // item.label can be null when using breakdowns on a property
      // that doesn't exist on all events
      const label = item.label?.trim() || NOT_SET_VALUE;
      if (label) {
        if (acc[label]) {
          acc[label]?.push(item);
        } else {
          acc[label] = [item];
        }
      }

      return {
        ...acc,
      };
    },
    {} as Record<string, ResultItem[]>
  );

  return Object.keys(series).map((key) => {
    // If we have breakdowns, we want to use the breakdown key as the legend
    // But only if it successfully broke it down, otherwise we use the getEventLabel
    const isBreakdown =
      payload.breakdowns.length && !alphabetIds.includes(key as 'A');
    const serieName = isBreakdown ? key : getEventLegend(payload.event);
    const data =
      payload.chartType === 'area' ||
      payload.chartType === 'linear' ||
      payload.chartType === 'histogram' ||
      payload.chartType === 'metric' ||
      payload.chartType === 'pie' ||
      payload.chartType === 'bar'
        ? fillEmptySpotsInTimeline(
            series[key] ?? [],
            payload.interval,
            payload.startDate,
            payload.endDate
          ).map((item) => {
            return {
              label: serieName,
              count: item.count ? round(item.count) : null,
              date: new Date(item.date).toISOString(),
            };
          })
        : (series[key] ?? []).map((item) => ({
            label: item.label,
            count: item.count ? round(item.count) : null,
            date: new Date(item.date).toISOString(),
          }));

    return {
      name: serieName,
      event: payload.event,
      data,
    };
  });
}

export function getDatesFromRange(range: IChartRange) {
  if (range === 'today') {
    const startDate = new Date();
    const endDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    return {
      startDate: startDate.toUTCString(),
      endDate: endDate.toUTCString(),
    };
  }

  if (range === '30min' || range === '1h') {
    const startDate = new Date(
      Date.now() - 1000 * 60 * (range === '30min' ? 30 : 60)
    ).toUTCString();
    const endDate = new Date().toUTCString();

    return {
      startDate,
      endDate,
    };
  }

  let days = 1;

  if (range === '24h') {
    const startDate = getDaysOldDate(days);
    const endDate = new Date();
    return {
      startDate: startDate.toUTCString(),
      endDate: endDate.toUTCString(),
    };
  } else if (range === '7d') {
    days = 7;
  } else if (range === '14d') {
    days = 14;
  } else if (range === '1m') {
    days = 30;
  } else if (range === '3m') {
    days = 90;
  } else if (range === '6m') {
    days = 180;
  } else if (range === '1y') {
    days = 365;
  }

  const startDate = getDaysOldDate(days);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date();
  endDate.setUTCHours(23, 59, 59, 999);
  return {
    startDate: startDate.toUTCString(),
    endDate: endDate.toUTCString(),
  };
}

export function getChartStartEndDate(
  input: Pick<IChartInput, 'endDate' | 'startDate' | 'range'>
) {
  return input.startDate && input.endDate
    ? { startDate: input.startDate, endDate: input.endDate }
    : getDatesFromRange(input.range);
}
