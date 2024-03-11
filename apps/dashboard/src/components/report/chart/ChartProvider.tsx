'use client';

import {
  createContext,
  memo,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { IChartSerie } from '@/server/api/routers/chart';
import type { IChartInput } from '@openpanel/validation';

import { ChartLoading } from './ChartLoading';
import { MetricCardLoading } from './MetricCard';

export interface ChartContextType extends IChartInput {
  editMode?: boolean;
  hideID?: boolean;
  onClick?: (item: IChartSerie) => void;
}

type ChartProviderProps = {
  children: React.ReactNode;
} & ChartContextType;

const ChartContext = createContext<ChartContextType | null>({
  events: [],
  breakdowns: [],
  chartType: 'linear',
  lineType: 'monotone',
  interval: 'day',
  name: '',
  range: '7d',
  metric: 'sum',
  previous: false,
  projectId: '',
});

export function ChartProvider({
  children,
  editMode,
  previous,
  hideID,
  ...props
}: ChartProviderProps) {
  return (
    <ChartContext.Provider
      value={useMemo(
        () => ({
          ...props,
          editMode: editMode ?? false,
          previous: previous ?? false,
          hideID: hideID ?? false,
        }),
        [editMode, previous, hideID, props]
      )}
    >
      {children}
    </ChartContext.Provider>
  );
}

export function withChartProivder<ComponentProps>(
  WrappedComponent: React.FC<ComponentProps>
) {
  const WithChartProvider = (props: ComponentProps & ChartContextType) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      return props.chartType === 'metric' ? (
        <MetricCardLoading />
      ) : (
        <ChartLoading />
      );
    }

    return (
      <Suspense
        fallback={
          props.chartType === 'metric' ? (
            <MetricCardLoading />
          ) : (
            <ChartLoading />
          )
        }
      >
        <ChartProvider {...props}>
          <WrappedComponent {...props} />
        </ChartProvider>
      </Suspense>
    );
  };

  WithChartProvider.displayName = `WithChartProvider(${
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'
  })`;

  return memo(WithChartProvider);
}

export function useChartContext() {
  return useContext(ChartContext)!;
}
