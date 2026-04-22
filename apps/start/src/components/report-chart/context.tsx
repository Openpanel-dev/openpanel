import isEqual from 'lodash.isequal';
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { IChartSerie, IReportInput } from '@openpanel/validation';

export type ReportChartContextType = {
  options: Partial<{
    columns: React.ReactNode[];
    hideLegend: boolean;
    hideXAxis: boolean;
    hideYAxis: boolean;
    aspectRatio: number;
    maxHeight: number;
    minHeight: number;
    maxDomain: number;
    onClick: (serie: IChartSerie) => void;
    renderSerieName: (names: string[]) => React.ReactNode;
    renderSerieIcon: (serie: IChartSerie) => React.ReactNode;
    dropdownMenuContent: (serie: IChartSerie) => {
      icon: LucideIcon;
      title: string;
      onClick: () => void;
    }[];
  }>;
  report: IReportInput & { id?: string };
  isLazyLoading: boolean;
  isEditMode: boolean;
  shareId?: string;
  reportId?: string;
};

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
      'useReportChartContext must be used within a ReportChartProvider',
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
