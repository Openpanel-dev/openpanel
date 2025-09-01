import isEqual from 'lodash.isequal';
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';

import type {
  IChartInput,
  IChartProps,
  IChartSerie,
} from '@openpanel/validation';

export type ReportChartContextType = {
  options: Partial<{
    columns: React.ReactNode[];
    hideID: boolean;
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
  report: IChartProps;
  isLazyLoading: boolean;
  isEditMode: boolean;
};

type ReportChartContextProviderProps = ReportChartContextType & {
  children: React.ReactNode;
};

export type ReportChartProps = Partial<ReportChartContextType> & {
  report: IChartInput;
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

export const useSelectReportChartContext = <T,>(
  selector: (ctx: ReportChartContextType) => T,
) => {
  const ctx = useReportChartContext();
  const [state, setState] = useState(selector(ctx));
  useEffect(() => {
    const newState = selector(ctx);
    if (!isEqual(newState, state)) {
      setState(newState);
    }
  }, [ctx]);
  return state;
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
