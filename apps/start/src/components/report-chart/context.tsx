import type {
  IChartSerie,
  IReportInput,
} from '@openpanel/core/modules/report/report.constants';
import isEqual from 'lodash.isequal';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ChartSizeTier } from './common/chart-size';

export interface ReportChartContextType {
  options: Partial<{
    columns: React.ReactNode[];
    hideLegend: boolean;
    /** Show the chart alone, without the series tables an editor shows under it. */
    hideTable: boolean;
    hideXAxis: boolean;
    hideYAxis: boolean;
    aspectRatio: number;
    maxHeight: number;
    minHeight: number;
    renderSerieName: (names: string[]) => React.ReactNode;
    renderSerieIcon: (serie: IChartSerie) => React.ReactNode;
  }>;
  report: IReportInput & { id?: string };
  isLazyLoading: boolean;
  isEditMode: boolean;
  // `fill` takes the parent's height (a dashboard tile); `aspect` sizes the
  // chart from its width (the editor, chat, modals, share pages).
  layout: 'fill' | 'aspect';
  /** From the chart's measured width; decides axes, ticks and legend size. */
  sizeTier: ChartSizeTier;
  shareId?: string;
  reportId?: string;
}

type ReportChartContextProviderProps = ReportChartContextType & {
  children: React.ReactNode;
};

export type ReportChartProps = Partial<ReportChartContextType> & {
  report: IReportInput & { id?: string };
  lazy?: boolean;
};

const context = createContext<ReportChartContextType | null>(null);

export const useReportChartContext = () => {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error(
      'useReportChartContext must be used within a ReportChartProvider'
    );
  }
  return ctx;
};

/**
 * Returns the report input suitable for chart queries — strips display-only
 * fields (like visibleSeries) that shouldn't affect the query cache key.
 */
export const useChartInput = () => {
  const { report } = useReportChartContext();
  return useMemo(() => {
    const { visibleSeries, ...input } = report;
    return input;
  }, [report]);
};

export const ReportChartProvider = ({
  children,
  ...propsToContext
}: ReportChartContextProviderProps) => {
  const [ctx, setContext] = useState(propsToContext);

  useEffect(() => {
    if (!isEqual(ctx, propsToContext)) {
      setContext(propsToContext);
    }
  }, [propsToContext]);

  return <context.Provider value={ctx}>{children}</context.Provider>;
};

export default context;
