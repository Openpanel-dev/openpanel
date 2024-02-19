import type { z } from 'zod';

import type { timeRanges } from '@mixan/constants';

import type {
  zChartBreakdown,
  zChartEvent,
  zChartInput,
  zChartType,
  zLineType,
  zMetric,
  zTimeInterval,
} from './index';

export type IChartInput = z.infer<typeof zChartInput>;
export type IChartEvent = z.infer<typeof zChartEvent>;
export type IChartEventFilter = IChartEvent['filters'][number];
export type IChartEventFilterValue =
  IChartEvent['filters'][number]['value'][number];
export type IChartEventFilterOperator =
  IChartEvent['filters'][number]['operator'];
export type IChartBreakdown = z.infer<typeof zChartBreakdown>;
export type IInterval = z.infer<typeof zTimeInterval>;
export type IChartType = z.infer<typeof zChartType>;
export type IChartMetric = z.infer<typeof zMetric>;
export type IChartLineType = z.infer<typeof zLineType>;
export type IChartRange = keyof typeof timeRanges;
export type IGetChartDataInput = {
  event: IChartEvent;
  projectId: string;
  startDate: string;
  endDate: string;
} & Omit<IChartInput, 'events' | 'name' | 'startDate' | 'endDate' | 'range'>;
