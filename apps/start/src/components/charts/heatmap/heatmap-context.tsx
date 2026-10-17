'use client';

import type { scaleLinear, scaleTime } from '@visx/scale';
import type { Transition } from 'motion/react';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Margin } from '../chart-context';
import type { ChartPhase, ChartStatus } from '../chart-phase';
import {
  HEATMAP_DEFAULT_LEVEL_COLORS,
  type HeatmapLevelStyles,
} from './heatmap-colors';
import type {
  HeatmapSeparatorLayout,
  HeatmapWeekStartDay,
} from './heatmap-utils';
import { cn } from '@/lib/utils';

type HeatmapTimeScale = ReturnType<typeof scaleTime<number>>;
type HeatmapLinearScale = ReturnType<typeof scaleLinear<number>>;

export interface HeatmapBin {
  count: number;
  bin: number;
  date: Date;
}

export interface HeatmapColumn {
  bin: number;
  bins: HeatmapBin[];
}

export interface HeatmapTooltipData {
  column: number;
  row: number;
  count: number;
  date: Date;
  x: number;
  y: number;
}

export interface HeatmapInteractionContextValue {
  hoveredCell: { column: number; row: number } | null;
  hoveredLegendLevel: number | null;
  tooltipData: HeatmapTooltipData | null;
  setHoveredCell: (cell: { column: number; row: number } | null) => void;
  setHoveredLegendLevel: (level: number | null) => void;
  setTooltipData: Dispatch<SetStateAction<HeatmapTooltipData | null>>;
  clearInteraction: () => void;
}

export interface HeatmapContextValue {
  data: HeatmapColumn[];
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
  binWidth: number;
  binHeight: number;
  gap: number;
  weekStartDay: HeatmapWeekStartDay;
  xScale: (columnIndex: number) => number;
  yScale: (rowIndex: number) => number;
  separatorLayout: HeatmapSeparatorLayout | null;
  timeXScale: HeatmapTimeScale;
  brushYScale: HeatmapLinearScale;
  isReady: boolean;
  colorScale: (count: number | null | undefined) => string;
  fillScale: (count: number | null | undefined) => string;
  levelStyles: HeatmapLevelStyles;
  containerRef: RefObject<HTMLDivElement | null>;
  chartStatus: ChartStatus;
  chartPhase: ChartPhase;
  isLoaded: boolean;
  revealEpoch: number;
  animationDuration: number;
  enterTransition?: Transition;
  enterStaggerScale: number;
  animateCells: boolean;
  loadingOpacity: number;
  showLoadingCells: boolean;
  loadingCellMaxOpacity: number;
  loadingCellRandomness: number;
  revealMode: HeatmapRevealMode;
  loadingLabel?: string;
  showLoadingLabel: boolean;
}

/** How cells transition into view after loading or on first mount. */
export type HeatmapRevealMode = 'enter' | 'fromLoading' | null;

const HeatmapContext = createContext<HeatmapContextValue | null>(null);
const HeatmapInteractionContext =
  createContext<HeatmapInteractionContextValue | null>(null);

export function HeatmapInteractionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hoveredCell, setHoveredCell] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const [hoveredLegendLevel, setHoveredLegendLevel] = useState<number | null>(
    null
  );
  const [tooltipData, setTooltipData] = useState<HeatmapTooltipData | null>(
    null
  );

  const clearInteraction = useCallback(() => {
    setHoveredCell(null);
    setHoveredLegendLevel(null);
    setTooltipData(null);
  }, []);

  const value = useMemo<HeatmapInteractionContextValue>(
    () => ({
      hoveredCell,
      hoveredLegendLevel,
      tooltipData,
      setHoveredCell,
      setHoveredLegendLevel,
      setTooltipData,
      clearInteraction,
    }),
    [clearInteraction, hoveredCell, hoveredLegendLevel, tooltipData]
  );

  return (
    <HeatmapInteractionContext.Provider value={value}>
      {children}
    </HeatmapInteractionContext.Provider>
  );
}

export function HeatmapProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: HeatmapContextValue;
}) {
  return (
    <HeatmapContext.Provider value={value}>{children}</HeatmapContext.Provider>
  );
}

export function useHeatmap(): HeatmapContextValue {
  const context = useContext(HeatmapContext);
  if (!context) {
    throw new Error('useHeatmap must be used within a HeatmapProvider');
  }
  return context;
}

export function useHeatmapInteraction(): HeatmapInteractionContextValue {
  const context = useContext(HeatmapInteractionContext);
  if (!context) {
    throw new Error(
      'useHeatmapInteraction must be used within a HeatmapInteractionProvider'
    );
  }
  return context;
}

export function useHeatmapInteractionOptional(): HeatmapInteractionContextValue | null {
  return useContext(HeatmapInteractionContext);
}

/** Clears hover state when the pointer leaves chart + legend. */
export function HeatmapInteractionBoundary({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { clearInteraction } = useHeatmapInteraction();

  return (
    <div
      className={cn('size-full min-h-0 min-w-0', className)}
      onPointerLeave={clearInteraction}
    >
      {children}
    </div>
  );
}

/** Nests a provider only when one is not already present upstream. */
export function HeatmapInteractionRoot({ children }: { children: ReactNode }) {
  const existing = useContext(HeatmapInteractionContext);
  if (existing) {
    return children;
  }
  return <HeatmapInteractionProvider>{children}</HeatmapInteractionProvider>;
}

/** @deprecated Use {@link HEATMAP_DEFAULT_LEVEL_COLORS} */
export const heatmapCssVars = {
  empty: HEATMAP_DEFAULT_LEVEL_COLORS[0],
  level1: HEATMAP_DEFAULT_LEVEL_COLORS[1],
  level2: HEATMAP_DEFAULT_LEVEL_COLORS[2],
  level3: HEATMAP_DEFAULT_LEVEL_COLORS[3],
  level4: HEATMAP_DEFAULT_LEVEL_COLORS[4],
} as const;
