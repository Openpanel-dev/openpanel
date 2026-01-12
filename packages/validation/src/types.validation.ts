import type { z } from 'zod';

export type UnionOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

import type {
  zChartBreakdown,
  zChartEvent,
  zChartEventItem,
  zChartEventSegment,
  zChartFormula,
  zChartSeries,
  zChartType,
  zCriteria,
  zLineType,
  zMetric,
  zRange,
  zReport,
  zReportInput,
  zTimeInterval,
} from './index';

// For saved reports - complete report with required display fields
export type IReport = z.infer<typeof zReport>;

// For API/engine use - flexible input
export type IReportInput = z.infer<typeof zReportInput>;

// With resolved dates (engine internal)
export interface IReportInputWithDates extends IReportInput {
  startDate: string;
  endDate: string;
}
export type IChartEvent = z.infer<typeof zChartEvent>;
export type IChartFormula = z.infer<typeof zChartFormula>;
export type IChartEventItem = z.infer<typeof zChartEventItem>;
export type IChartSeries = z.infer<typeof zChartSeries>;
// Backward compatibility alias
export type IChartEvents = IChartSeries;
export type IChartEventSegment = z.infer<typeof zChartEventSegment>;
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
export type IChartRange = z.infer<typeof zRange>;
export type IGetChartDataInput = {
  event: IChartEvent;
  projectId: string;
  startDate: string;
  endDate: string;
} & Omit<IReportInput, 'series' | 'startDate' | 'endDate' | 'range'>;
export type ICriteria = z.infer<typeof zCriteria>;

export type PreviousValue =
  | {
      value: number;
      diff: number | null;
      state: 'positive' | 'negative' | 'neutral';
    }
  | undefined;

export type Metrics = {
  sum: number;
  average: number;
  min: number;
  max: number;
  count: number | undefined;
  previous?: {
    sum: PreviousValue;
    average: PreviousValue;
    min: PreviousValue;
    max: PreviousValue;
    count: PreviousValue;
  };
};

export type IChartSerie = {
  id: string;
  names: string[];
  event: {
    id?: string;
    name: string;
    breakdowns?: Record<string, string>;
  };
  metrics: Metrics;
  data: {
    date: string;
    count: number;
    previous: PreviousValue;
  }[];
};

export type FinalChart = {
  series: IChartSerie[];
  metrics: Metrics;
};

export type ISetCookie = (
  key: string,
  value: string,
  options: {
    maxAge?: number;
    domain?: string;
    path?: string;
    sameSite?: 'lax' | 'strict' | 'none';
    secure?: boolean;
    httpOnly?: boolean;
  },
) => void;
