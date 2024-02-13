'use client';

import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { IChartSerie } from '@/server/api/routers/chart';
import type { IChartInput } from '@/types';

import { ChartLoading } from './ChartLoading';

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
          editMode: editMode ?? false,
          previous: previous ?? false,
          hideID: hideID ?? false,
          ...props,
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
    const [mounted, setMounted] = useState(props.chartType === 'metric');

    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      return <ChartLoading />;
    }

    return (
      <ChartProvider {...props}>
        <WrappedComponent {...props} />
      </ChartProvider>
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
