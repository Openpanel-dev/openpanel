import type { z } from 'zod';

import type {
  zChartBreakdown,
  zChartEvent,
  zChartEventSegment,
  zChartInput,
  zChartInputAI,
  zChartType,
  zCriteria,
  zLineType,
  zMetric,
  zRange,
  zReportInput,
  zTimeInterval,
} from './index';

export type IChartInput = z.infer<typeof zChartInput>;
export type IChartInputAi = z.infer<typeof zChartInputAI>;
export type IChartProps = z.infer<typeof zReportInput> & {
  name: string;
  lineType: IChartLineType;
  unit?: string;
  previousIndicatorInverted?: boolean;
};
export type IChartEvent = z.infer<typeof zChartEvent>;
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
export interface IChartInputWithDates extends IChartInput {
  startDate: string;
  endDate: string;
}
export type IGetChartDataInput = {
  event: IChartEvent;
  projectId: string;
  startDate: string;
  endDate: string;
} & Omit<IChartInput, 'events' | 'name' | 'startDate' | 'endDate' | 'range'>;
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
  previous?: {
    sum: PreviousValue;
    average: PreviousValue;
    min: PreviousValue;
    max: PreviousValue;
  };
};

export type IChartSerie = {
  id: string;
  names: string[];
  event: {
    id?: string;
    name: string;
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
