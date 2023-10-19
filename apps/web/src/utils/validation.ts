import { ChartType } from "@prisma/client";
import { z } from "zod";

export const zChartEvent = z.object({
  id: z.string(),
  name: z.string(),
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      value: z.string(),
    }),
  ),
});
export const zChartBreakdown = z.object({
  id: z.string(),
  name: z.string(),
});

export const zChartEvents = z.array(zChartEvent);
export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(['linear', 'bar', 'pie', 'metric', 'area']);

export const zTimeInterval = z.enum(["day", "hour", "month"]);

export const zChartInput = z.object({
  name: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  chartType: zChartType,
  interval: zTimeInterval,
  events: zChartEvents,
  breakdowns: zChartBreakdowns,
})