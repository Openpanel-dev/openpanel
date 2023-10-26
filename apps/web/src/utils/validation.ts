import { z } from "zod";
import { operators } from "./constants";

function objectToZodEnums<K extends string> ( obj: Record<K, any> ): [ K, ...K[] ] {
  const [ firstKey, ...otherKeys ] = Object.keys( obj ) as K[]
  return [ firstKey!, ...otherKeys ]
}

export const zChartEvent = z.object({
  id: z.string(),
  name: z.string(),
  segment: z.enum(["event", "user"]),
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      operator: z.enum(objectToZodEnums(operators)),
      value: z.array(
        z
          .string()
          .or(z.number())
          .or(z.boolean())
          .or(z.null())
      ),
    }),
  ),
});
export const zChartBreakdown = z.object({
  id: z.string(),
  name: z.string(),
});

export const zChartEvents = z.array(zChartEvent);
export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(["linear", "bar", "pie", "metric", "area"]);

export const zTimeInterval = z.enum(["day", "hour", "month"]);

export const zChartInput = z.object({
  name: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  chartType: zChartType,
  interval: zTimeInterval,
  events: zChartEvents,
  breakdowns: zChartBreakdowns,
});
