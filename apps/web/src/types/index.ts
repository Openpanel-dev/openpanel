import { type zTimeInterval, type zChartBreakdown, type zChartEvent, type zChartInput } from "@/utils/validation";
import { type Client, type Project } from "@prisma/client";
import { type TooltipProps } from "recharts";
import { type z } from "zod";

export type HtmlProps<T> = React.DetailedHTMLProps<React.HTMLAttributes<T>, T>;

export type IChartInput = z.infer<typeof zChartInput>
export type IChartEvent = z.infer<typeof zChartEvent>
export type IChartEventFilter = IChartEvent['filters'][number]
export type IChartEventFilterValue = IChartEvent['filters'][number]['value'][number]
export type IChartBreakdown = z.infer<typeof zChartBreakdown>
export type IInterval = z.infer<typeof zTimeInterval>


export type IToolTipProps<T> = Omit<TooltipProps<number, string>, 'payload'> & {
  payload?: Array<T>
}


export type IProject = Project
export type IClientWithProject = Client & {
  project: IProject
}