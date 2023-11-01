import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { last, pipe, sort, uniq } from "ramda";
import { toDots } from "@/utils/object";
import { zChartInputWithDates } from "@/utils/validation";
import {
  type IChartInputWithDates,
  type IChartEvent,
  type IChartRange,
} from "@/types";
import { getDaysOldDate } from "@/utils/date";

export const config = {
  api: {
    responseLimit: false,
  },
};

export const chartRouter = createTRPCRouter({
  events: protectedProcedure.query(async () => {
    const events = await db.event.findMany({
      take: 500,
      distinct: ["name"],
    });

    return events;
  }),

  properties: protectedProcedure
    .input(z.object({ event: z.string() }).optional())
    .query(async ({ input }) => {
      const events = await db.event.findMany({
        take: 500,
        where: {
          ...(input?.event
            ? {
                name: input.event,
              }
            : {}),
        },
      });

      const properties = events
        .reduce((acc, event) => {
          const properties = event as Record<string, unknown>;
          const dotNotation = toDots(properties);
          return [...acc, ...Object.keys(dotNotation)];
        }, [] as string[])
        .map((item) => item.replace(/\.([0-9]+)\./g, ".*."))
        .map((item) => item.replace(/\.([0-9]+)/g, "[*]"));

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq,
      )(properties);
    }),

  values: protectedProcedure
    .input(z.object({ event: z.string(), property: z.string() }))
    .query(async ({ input }) => {
      if (isJsonPath(input.property)) {
        const events = await db.$queryRawUnsafe<{ value: string }[]>(
          `SELECT ${selectJsonPath(
            input.property,
          )} AS value from events WHERE name = '${
            input.event
          }' AND "createdAt" >= NOW() - INTERVAL '30 days'`,
        );
        return {
          values: uniq(events.map((item) => item.value)),
        };
      } else {
        const events = await db.event.findMany({
          where: {
            name: input.event,
            [input.property]: {
              not: null,
            },
            createdAt: {
              gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 30),
            },
          },
          distinct: input.property as any,
          select: {
            [input.property]: true,
          },
        });

        return {
          values: uniq(events.map((item) => item[input.property]!)),
        };
      }
    }),

  chart: protectedProcedure
    .input(zChartInputWithDates)
    .query(async ({ input: { events, ...input } }) => {
      const series: Awaited<ReturnType<typeof getChartData>> = [];
      for (const event of events) {
        series.push(
          ...(await getChartData({
            ...input,
            event,
          })),
        );
      }

      const sorted = [...series].sort((a, b) => {
        if (input.chartType === "linear") {
          const sumA = a.data.reduce((acc, item) => acc + item.count, 0);
          const sumB = b.data.reduce((acc, item) => acc + item.count, 0);
          return sumB - sumA;
        } else {
          return b.totalCount - a.totalCount;
        }
      });

      const meta = {
        highest: sorted[0]?.totalCount ?? 0,
        lowest: last(sorted)?.totalCount ?? 0,
      };

      return {
        events: Object.entries(
          series.reduce(
            (acc, item) => {
              if (acc[item.event.id]) {
                acc[item.event.id] += item.totalCount;
              } else {
                acc[item.event.id] = item.totalCount;
              }
              return acc;
            },
            {} as Record<(typeof series)[number]["event"]["id"], number>,
          ),
        ).map(([id, count]) => ({
          count,
          ...events.find((event) => event.id === id)!,
        })),
        series: sorted.map((item) => ({
          ...item,
          meta,
        })),
      };
    }),
});

function selectJsonPath(property: string) {
  const jsonPath = property
    .replace(/^properties\./, "")
    .replace(/\.\*\./g, ".**.");
  return `jsonb_path_query(properties, '$.${jsonPath}')`;
}

function isJsonPath(property: string) {
  return property.startsWith("properties");
}

type ResultItem = {
  label: string | null;
  count: number;
  date: string;
};

function propertyNameToSql(name: string) {
  if (name.includes(".")) {
    const str = name
      .split(".")
      .map((item, index) => (index === 0 ? item : `'${item}'`))
      .join("->");
    const findLastOf = "->";
    const lastArrow = str.lastIndexOf(findLastOf);
    if (lastArrow === -1) {
      return str;
    }
    const first = str.slice(0, lastArrow);
    const last = str.slice(lastArrow + findLastOf.length);
    return `${first}->>${last}`;
  }

  return name;
}

function getEventLegend(event: IChartEvent) {
  return `${event.name} (${event.id})`;
}

function getTotalCount(arr: ResultItem[]) {
  return arr.reduce((acc, item) => acc + item.count, 0);
}

function isFloat(n: number) {
  return n % 1 !== 0;
}

function getDatesFromRange(range: IChartRange) {
  if (range === 0) {
    const startDate = new Date();
    const endDate = new Date().toISOString();
    startDate.setHours(0, 0, 0, 0);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate,
    };
  }

  if (isFloat(range)) {
    const startDate = new Date(Date.now() - 1000 * 60 * (range * 100));
    const endDate = new Date().toISOString();

    return {
      startDate: startDate.toISOString(),
      endDate: endDate,
    };
  }

  const startDate = getDaysOldDate(range).toISOString();
  const endDate = new Date().toISOString();
  return {
    startDate,
    endDate,
  };
}

function getChartSql({ event, chartType, breakdowns, interval, startDate, endDate }: Omit<IGetChartDataInput,  'range'>) {
  const select = [];
  const where = [];
  const groupBy = [];
  const orderBy = [];

  if (event.segment === "event") {
    select.push(`count(*)::int as count`);
  } else {
    select.push(`count(DISTINCT profile_id)::int as count`);
  }

  switch (chartType) {
    case "bar": {
      orderBy.push("count DESC");
      break;
    }
    case "linear": {
      select.push(`date_trunc('${interval}', "createdAt") as date`);
      groupBy.push("date");
      orderBy.push("date");
      break;
    }
  }

  if (event) {
    const { name, filters } = event;
    where.push(`name = '${name}'`);
    if (filters.length > 0) {
      filters.forEach((filter) => {
        const { name, value } = filter;
        switch (filter.operator) {
          case "is": {
            if (name.includes(".*.") || name.endsWith("[*]")) {
              where.push(
                `properties @? '$.${name
                  .replace(/^properties\./, "")
                  .replace(/\.\*\./g, "[*].")} ? (${value
                  .map((val) => `@ == "${val}"`)
                  .join(" || ")})'`,
              );
            } else {
              where.push(
                `${propertyNameToSql(name)} in (${value
                  .map((val) => `'${val}'`)
                  .join(", ")})`,
              );
            }
            break;
          }
          case "isNot": {
            if (name.includes(".*.") || name.endsWith("[*]")) {
              where.push(
                `properties @? '$.${name
                  .replace(/^properties\./, "")
                  .replace(/\.\*\./g, "[*].")} ? (${value
                  .map((val) => `@ != "${val}"`)
                  .join(" && ")})'`,
              );
            } else if (name.includes(".")) {
              where.push(
                `${propertyNameToSql(name)} not in (${value
                  .map((val) => `'${val}'`)
                  .join(", ")})`,
              );
            }
            break;
          }
        }
      });
    }
  }

  if (breakdowns.length) {
    const breakdown = breakdowns[0];
    if (breakdown) {
      if (isJsonPath(breakdown.name)) {
        select.push(`${selectJsonPath(breakdown.name)} as label`);
      } else {
        select.push(`${breakdown.name} as label`);
      }
      groupBy.push(`label`);
    }
  } else {
    if (event.name) {
      select.push(`'${event.name}' as label`);
    }
  }

  if (startDate) {
    where.push(`"createdAt" >= '${startDate}'`);
  }

  if (endDate) {
    where.push(`"createdAt" <= '${endDate}'`);
  }

  const sql = [
    `SELECT ${select.join(", ")}`,
    `FROM events`,
    `WHERE ${where.join(" AND ")}`,
  ];

  if (groupBy.length) {
    sql.push(`GROUP BY ${groupBy.join(", ")}`);
  }
  if (orderBy.length) {
    sql.push(`ORDER BY ${orderBy.join(", ")}`);
  }

  return sql.join("\n");
}

type IGetChartDataInput = {
  event: IChartEvent;
} & Omit<IChartInputWithDates, "events" | 'name'>

async function getChartData({
  chartType,
  event,
  breakdowns,
  interval,
  range,
  startDate: _startDate,
  endDate: _endDate,
}: IGetChartDataInput) {
  const { startDate, endDate } =
    _startDate && _endDate
      ? {
          startDate: _startDate,
          endDate: _endDate,
        }
      : getDatesFromRange(range);

  const sql = getChartSql({
    chartType,
    event,
    breakdowns,
    interval,
    startDate,
    endDate,
  })

  let result = await db.$queryRawUnsafe<ResultItem[]>(sql);

  if(result.length === 0 && breakdowns.length > 0) {
    result = await db.$queryRawUnsafe<ResultItem[]>(getChartSql({
      chartType,
      event,
      breakdowns: [],
      interval,
      startDate,
      endDate,
    }));
  }

  console.log(sql);
  

  // group by sql label
  const series = result.reduce(
    (acc, item) => {
      // item.label can be null when using breakdowns on a property
      // that doesn't exist on all events
      const label = item.label?.trim() ?? event.id;
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
    {} as Record<string, ResultItem[]>,
  );

  return Object.keys(series).map((key) => {
    const legend = breakdowns.length ? key : getEventLegend(event);
    const data = series[key] ?? [];

    return {
      name: legend,
      event: {
        id: event.id,
        name: event.name,
      },
      totalCount: getTotalCount(data),
      data:
        chartType === "linear"
          ? fillEmptySpotsInTimeline(data, interval, startDate, endDate).map(
              (item) => {
                return {
                  label: legend,
                  count: item.count,
                  date: new Date(item.date).toISOString(),
                };
              },
            )
          : [],
    };
  });
}

function fillEmptySpotsInTimeline(
  items: ResultItem[],
  interval: string,
  startDate: string,
  endDate: string,
) {
  const result = [];
  const clonedStartDate = new Date(startDate);
  const clonedEndDate = new Date(endDate);
  const today = new Date();

  if(interval === 'minute') { 
    clonedStartDate.setSeconds(0, 0)
    clonedEndDate.setMinutes(clonedEndDate.getMinutes() + 1, 0, 0);
  } else if (interval === "hour") {
    clonedStartDate.setMinutes(0, 0, 0);
    clonedEndDate.setMinutes(0, 0, 0);
  } else {
    clonedStartDate.setHours(2, 0, 0, 0);
    clonedEndDate.setHours(2, 0, 0, 0);
  }

  // Force if interval is month and the start date is the same month as today
  const shouldForce = () =>
    interval === "month" &&
    clonedStartDate.getFullYear() === today.getFullYear() &&
    clonedStartDate.getMonth() === today.getMonth();

  while (
    shouldForce() ||
    clonedStartDate.getTime() <= clonedEndDate.getTime()
  ) {
    const getYear = (date: Date) => date.getFullYear();
    const getMonth = (date: Date) => date.getMonth();
    const getDay = (date: Date) => date.getDate();
    const getHour = (date: Date) => date.getHours();
    const getMinute = (date: Date) => date.getMinutes();

    const item = items.find((item) => {
      const date = new Date(item.date);

      if (interval === "month") {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate)
        );
      }
      if (interval === "day") {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate)
        );
      }
      if (interval === "hour") {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate) &&
          getHour(date) === getHour(clonedStartDate)
        );
      }
      if (interval === "minute") {
        return (
          getYear(date) === getYear(clonedStartDate) &&
          getMonth(date) === getMonth(clonedStartDate) &&
          getDay(date) === getDay(clonedStartDate) &&
          getHour(date) === getHour(clonedStartDate) &&
          getMinute(date) === getMinute(clonedStartDate)
        );
      }
    });

    if (item) {
      result.push(item);
    } else {
      result.push({
        date: clonedStartDate.toISOString(),
        count: 0,
        label: null,
      });
    }

    switch (interval) {
      case "day": {
        clonedStartDate.setDate(clonedStartDate.getDate() + 1);
        break;
      }
      case "hour": {
        clonedStartDate.setHours(clonedStartDate.getHours() + 1);
        break;
      }
      case "minute": {
        clonedStartDate.setMinutes(clonedStartDate.getMinutes() + 1);
        break;
      }
      case "month": {
        clonedStartDate.setMonth(clonedStartDate.getMonth() + 1);
        break;
      }
    }
  }

  return sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  }, result);
}
