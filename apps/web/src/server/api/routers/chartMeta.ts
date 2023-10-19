import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { map, path, pipe, sort, uniq } from "ramda";
import { toDots } from "@/utils/object";
import { Prisma } from "@prisma/client";
import { zChartInput } from "@/utils/validation";
import { type IChartBreakdown, type IChartEvent } from "@/types";

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
    const findLastOf  = "->"
    const lastArrow = str.lastIndexOf(findLastOf);
    if(lastArrow === -1) {
      return str;
    } 
    const first = str.slice(0, lastArrow);
    const last = str.slice(lastArrow + findLastOf.length);
    return `${first}->>${last}`
  }

  return name;
}

function getEventLegend(event: IChartEvent) {
  return `${event.name} (${event.id})`;
}

function getTotalCount(arr: ResultItem[]) {
  return arr.reduce((acc, item) => acc + item.count, 0);
}

export const config = {
  api: {
    responseLimit: false,
  },
};

async function getChartData({
  chartType,
  event,
  breakdowns,
  interval,
  startDate,
  endDate,
}: {
  chartType: string;
  event: IChartEvent;
  breakdowns: IChartBreakdown[];
  interval: string;
  startDate: Date;
  endDate: Date;
}) {
  const select = [`count(*)::int as count`];
  const where = [];
  const groupBy = [];
  const orderBy = [];

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
        if (name.includes(".")) {
          where.push(`${propertyNameToSql(name)} = '${value}'`);
        } else {
          where.push(`${name} = '${value}'`);
        }
      });
    }
  }

  if (breakdowns.length) {
    const breakdown = breakdowns[0];
    if (breakdown) {
      select.push(`${propertyNameToSql(breakdown.name)} as label`);
      groupBy.push(`label`);
    }
  } else {
    if (event.name) {
      select.push(`'${event.name}' as label`);
    }
  }

  if (startDate) {
    where.push(`"createdAt" >= '${startDate.toISOString()}'`);
  }

  if (endDate) {
    where.push(`"createdAt" <= '${endDate.toISOString()}'`);
  }

  const sql = `
      SELECT ${select.join(", ")}
      FROM events 
      WHERE ${where.join(" AND ")}
      GROUP BY ${groupBy.join(", ")}
      ORDER BY ${orderBy.join(", ")}
      `;

      const result = await db.$queryRawUnsafe<ResultItem[]>(sql);

  // group by sql label
  const series = result.reduce(
    (acc, item) => {
      // item.label can be null when using breakdowns on a property
      // that doesn't exist on all events
      // fallback on event legend
      const label = item.label?.trim() ?? getEventLegend(event);
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
      totalCount: getTotalCount(data),
      data: fillEmptySpotsInTimeline(data, interval, startDate, endDate).map(
        (item) => {
          return {
            label: legend,
            count: item.count,
            date: new Date(item.date).toISOString(),
          };
        },
      ),
    };
  });
}

export const chartMetaRouter = createTRPCRouter({
  events: protectedProcedure
    // .input(z.object())
    .query(async ({ input }) => {
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

      const properties = events.reduce((acc, event) => {
        const properties = event as Record<string, unknown>;
        const dotNotation = toDots(properties);
        return [...acc, ...Object.keys(dotNotation)];
      }, [] as string[]);

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq,
      )(properties);
    }),

  values: protectedProcedure
    .input(z.object({ event: z.string(), property: z.string() }))
    .query(async ({ input }) => {
      const events = await db.event.findMany({
        where: {
          name: input.event,
          properties: {
            path: input.property.split(".").slice(1),
            not: Prisma.DbNull,
          },
          createdAt: {
            // Take last 30 days
            gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 30),
          },
        },
      });

      const values = uniq(
        map(path(input.property.split(".")), events),
      ) as string[];

      return {
        types: uniq(
          values.map((value) =>
            Array.isArray(value) ? "array" : typeof value,
          ),
        ),
        values,
      };
    }),

  chart: protectedProcedure
    .input(zChartInput)
    .query(
      async ({
        input: { chartType, events, breakdowns, interval, ...input },
      }) => {
        const startDate = input.startDate ?? new Date();
        const endDate = input.endDate ?? new Date();
        const series: Awaited<ReturnType<typeof getChartData>> = [];
        for (const event of events) {
          series.push(
            ...(await getChartData({
              chartType,
              event,
              breakdowns,
              interval,
              startDate,
              endDate,
            })),
          );
        }

        return {
          series: series.sort((a, b) => {
            const sumA = a.data.reduce((acc, item) => acc + item.count, 0);
            const sumB = b.data.reduce((acc, item) => acc + item.count, 0);
            return sumB - sumA;
          }),
        };
      },
    ),
});

function fillEmptySpotsInTimeline(
  items: ResultItem[],
  interval: string,
  startDate: Date,
  endDate: Date,
) {
  const result = [];
  const clonedStartDate = new Date(startDate);
  const clonedEndDate = new Date(endDate);
  if(interval === 'hour') {
    clonedStartDate.setMinutes(0, 0, 0);
    clonedEndDate.setMinutes(0, 0, 0)
  } else {
    clonedStartDate.setHours(2, 0, 0, 0);
    clonedEndDate.setHours(2, 0, 0, 0);
  }
  
  while (clonedStartDate.getTime() <= clonedEndDate.getTime()) {
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
