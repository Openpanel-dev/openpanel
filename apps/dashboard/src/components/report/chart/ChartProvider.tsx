'use client';

import { createContext, useContext } from 'react';
import type { LucideIcon } from 'lucide-react';

import type { IChartProps, IChartSerie } from '@openpanel/validation';

export interface IChartContextType extends IChartProps {
  hideXAxis?: boolean;
  hideYAxis?: boolean;
  aspectRatio?: number;
  editMode?: boolean;
  hideID?: boolean;
  onClick?: (item: IChartSerie) => void;
  renderSerieName?: (names: string[]) => React.ReactNode;
  renderSerieIcon?: (serie: IChartSerie) => React.ReactNode;
  dropdownMenuContent?: (serie: IChartSerie) => {
    icon: LucideIcon;
    title: string;
    onClick: () => void;
  }[];
}

type IChartProviderProps = {
  children: React.ReactNode;
} & IChartContextType;

const ChartContext = createContext<IChartContextType | null>(null);

export function ChartProvider({ children, ...props }: IChartProviderProps) {
  return (
    <ChartContext.Provider
      value={
        props.chartType === 'funnel' ? { ...props, previous: true } : props
      }
    >
      {children}
    </ChartContext.Provider>
  );
}

export function useChartContext() {
  return useContext(ChartContext)!;
}
