import { type zTimeInterval, type zChartBreakdown, type zChartEvent } from "@/utils/validation";
import { type TooltipProps } from "recharts";
import { type z } from "zod";

export type IChartEvent = z.infer<typeof zChartEvent>
export type IChartEventFilter = IChartEvent['filters'][number]
export type IChartBreakdown = z.infer<typeof zChartBreakdown>
export type IInterval = z.infer<typeof zTimeInterval>


export type IToolTipProps<T> = Omit<TooltipProps<number, string>, 'payload'> & {
  payload?: Array<T>
}