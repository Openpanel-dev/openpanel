import { z } from "zod";
import { operators, chartTypes, intervals } from "./constants";

function objectToZodEnums<K extends string>(obj: Record<K, any>): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
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
      value: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())),
    }),
  ),
});
export const zChartBreakdown = z.object({
  id: z.string(),
  name: z.string(),
});

export const zChartEvents = z.array(zChartEvent);
export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(objectToZodEnums(chartTypes));

export const zTimeInterval = z.enum(objectToZodEnums(intervals));

export const zChartInput = z.object({
  name: z.string(),
  chartType: zChartType,
  interval: zTimeInterval,
  events: zChartEvents,
  breakdowns: zChartBreakdowns,
  range: z
    .literal(0)
    .or(z.literal(1))
    .or(z.literal(7))
    .or(z.literal(14))
    .or(z.literal(30))
    .or(z.literal(90))
    .or(z.literal(180))
    .or(z.literal(365)),
});

export const zChartInputWithDates = zChartInput.extend({
  startDate: z.string().nullish(),
  endDate: z.string().nullable(),
});
