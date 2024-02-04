import type { timeRanges } from '@/utils/constants';
import type {
  zChartBreakdown,
  zChartEvent,
  zChartInput,
  zChartType,
  zLineType,
  zMetric,
  zTimeInterval,
} from '@/utils/validation';
import type { TooltipProps } from 'recharts';
import type { z } from 'zod';

import type { Client, Project } from '@mixan/db';

export type HtmlProps<T> = Omit<
  React.DetailedHTMLProps<React.HTMLAttributes<T>, T>,
  'ref'
>;

export type IChartInput = z.infer<typeof zChartInput>;
export type IChartEvent = z.infer<typeof zChartEvent>;
export type IChartEventFilter = IChartEvent['filters'][number];
export type IChartEventFilterValue =
  IChartEvent['filters'][number]['value'][number];
export type IChartBreakdown = z.infer<typeof zChartBreakdown>;
export type IInterval = z.infer<typeof zTimeInterval>;
export type IChartType = z.infer<typeof zChartType>;
export type IChartMetric = z.infer<typeof zMetric>;
export type IChartLineType = z.infer<typeof zLineType>;
export type IChartRange = keyof typeof timeRanges;
export type IToolTipProps<T> = Omit<TooltipProps<number, string>, 'payload'> & {
  payload?: T[];
};

export type IProject = Project;
export type IClientWithProject = Client & {
  project: IProject;
};

export type IGetChartDataInput = {
  event: IChartEvent;
  projectId: string;
  startDate: string;
  endDate: string;
} & Omit<IChartInput, 'events' | 'name' | 'startDate' | 'endDate' | 'range'>;
