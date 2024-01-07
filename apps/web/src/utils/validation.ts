import { z } from 'zod';

import { chartTypes, intervals, operators, timeRanges } from './constants';

function objectToZodEnums<K extends string>(obj: Record<K, any>): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const zChartEvent = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  segment: z.enum(['event', 'user', 'user_average', 'one_event_per_user']),
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      operator: z.enum(objectToZodEnums(operators)),
      value: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())),
    })
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
  range: z.enum(objectToZodEnums(timeRanges)),
});

export const zChartInputWithDates = zChartInput.extend({
  startDate: z.string().nullish(),
  endDate: z.string().nullable(),
});
