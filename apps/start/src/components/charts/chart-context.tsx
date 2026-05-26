'use client';

import type { scaleBand, scaleLinear, scaleTime } from '@visx/scale';

type ScaleLinear<Output, _Input = number> = ReturnType<
  typeof scaleLinear<Output>
>;
type ScaleTime<Output, _Input = Date | number> = ReturnType<
  typeof scaleTime<Output>
>;
type ScaleBand<Domain extends { toString(): string }> = ReturnType<
  typeof scaleBand<Domain>
>;

import type { Transition } from 'motion/react';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useContext,
  useMemo,
} from 'react';
import type { ChartSelection } from './use-chart-interaction';

// CSS variable references for theming
export const chartCssVars = {
  background: 'var(--chart-background)',
  foreground: 'var(--chart-foreground)',
  foregroundMuted: 'var(--chart-foreground-muted)',
  label: 'var(--chart-label)',
  linePrimary: 'var(--chart-line-primary)',
  lineSecondary: 'var(--chart-line-secondary)',
  crosshair: 'var(--chart-crosshair)',
  grid: 'var(--chart-grid)',
  indicatorColor: 'var(--chart-indicator-color)',
  indicatorSecondaryColor: 'var(--chart-indicator-secondary-color)',
  markerBackground: 'var(--chart-marker-background)',
  markerBorder: 'var(--chart-marker-border)',
  markerForeground: 'var(--chart-marker-foreground)',
  badgeBackground: 'var(--chart-marker-badge-background)',
  badgeForeground: 'var(--chart-marker-badge-foreground)',
  segmentBackground: 'var(--chart-segment-background)',
  segmentLine: 'var(--chart-segment-line)',
};

/** Default scatter series colors from the chart palette (`--chart-1` … `--chart-5`). */
export const defaultScatterColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TooltipData {
  point: Record<string, unknown>;
  index: number;
  x: number;
  yPositions: Record<string, number>;
  xPositions?: Record<string, number>;
}

export interface LineConfig {
  dataKey: string;
  stroke: string;
  strokeWidth: number;
}

/**
 * Hover/selection state lives in its own context so consumers that don't
 * care about it (Grid, YAxis, PatternArea, etc.) can subscribe to the
 * stable slice and skip re-rendering on every hover bucket change.
 */
export interface ChartHoverContextValue {
  tooltipData: TooltipData | null;
  setTooltipData: Dispatch<SetStateAction<TooltipData | null>>;
  selection?: ChartSelection | null;
  clearSelection?: () => void;
  hoveredBarIndex?: number | null;
  setHoveredBarIndex?: (index: number | null) => void;
  hoveredCandleIndex?: number | null;
  setHoveredCandleIndex?: (index: number | null) => void;
}

export interface ChartContextValue extends ChartHoverContextValue {
  // Data
  data: Record<string, unknown>[];

  // Scales
  xScale: ScaleTime<number, number>;
  yScale: ScaleLinear<number, number>;

  // Dimensions
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;

  columnWidth: number;
  containerRef: RefObject<HTMLDivElement | null>;
  lines: LineConfig[];

  // Animation state
  isLoaded: boolean;
  animationDuration: number;
  animationEasing?: string;
  enterTransition?: Transition;
  revealEpoch?: number;

  xAccessor: (d: Record<string, unknown>) => Date;
  dateLabels: string[];

  // Bar chart specific (optional - only present in BarChart)
  barScale?: ScaleBand<string>;
  bandWidth?: number;
  barXAccessor?: (d: Record<string, unknown>) => string;
  orientation?: 'vertical' | 'horizontal';
  stacked?: boolean;
  stackOffsets?: Map<number, Map<string, number>>;

  // ComposedChart + SeriesBar (optional)
  composedBarDataKeys?: string[];
  composedBarSize?: number;
  composedMaxBarSize?: number;
  composedBarGap?: number;
  composedStacked?: boolean;
  composedStackOffsets?: Map<number, Map<string, number>>;
  composedStackGap?: number;
}

export type ChartStableContextValue = Omit<
  ChartContextValue,
  | 'tooltipData'
  | 'setTooltipData'
  | 'selection'
  | 'clearSelection'
  | 'hoveredBarIndex'
  | 'setHoveredBarIndex'
  | 'hoveredCandleIndex'
  | 'setHoveredCandleIndex'
>;

const ChartStableContext = createContext<ChartStableContextValue | null>(null);
const ChartHoverContext = createContext<ChartHoverContextValue | null>(null);

/**
 * Splits the merged `value` into a stable slice and a volatile hover slice,
 * publishing each to its own context. Memoized on individual field
 * identities so changing `tooltipData` doesn't bust the stable slice's
 * identity — consumers of `useChartStable()` skip re-renders on hover.
 */
export function ChartProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ChartContextValue;
}) {
  const stable = useMemo<ChartStableContextValue>(
    () => ({
      data: value.data,
      xScale: value.xScale,
      yScale: value.yScale,
      width: value.width,
      height: value.height,
      innerWidth: value.innerWidth,
      innerHeight: value.innerHeight,
      margin: value.margin,
      columnWidth: value.columnWidth,
      containerRef: value.containerRef,
      lines: value.lines,
      isLoaded: value.isLoaded,
      animationDuration: value.animationDuration,
      animationEasing: value.animationEasing,
      enterTransition: value.enterTransition,
      revealEpoch: value.revealEpoch,
      xAccessor: value.xAccessor,
      dateLabels: value.dateLabels,
      barScale: value.barScale,
      bandWidth: value.bandWidth,
      barXAccessor: value.barXAccessor,
      orientation: value.orientation,
      stacked: value.stacked,
      stackOffsets: value.stackOffsets,
      composedBarDataKeys: value.composedBarDataKeys,
      composedBarSize: value.composedBarSize,
      composedMaxBarSize: value.composedMaxBarSize,
      composedBarGap: value.composedBarGap,
      composedStacked: value.composedStacked,
      composedStackOffsets: value.composedStackOffsets,
      composedStackGap: value.composedStackGap,
    }),
    [
      value.data,
      value.xScale,
      value.yScale,
      value.width,
      value.height,
      value.innerWidth,
      value.innerHeight,
      value.margin,
      value.columnWidth,
      value.containerRef,
      value.lines,
      value.isLoaded,
      value.animationDuration,
      value.animationEasing,
      value.enterTransition,
      value.revealEpoch,
      value.xAccessor,
      value.dateLabels,
      value.barScale,
      value.bandWidth,
      value.barXAccessor,
      value.orientation,
      value.stacked,
      value.stackOffsets,
      value.composedBarDataKeys,
      value.composedBarSize,
      value.composedMaxBarSize,
      value.composedBarGap,
      value.composedStacked,
      value.composedStackOffsets,
      value.composedStackGap,
    ]
  );

  const hover = useMemo<ChartHoverContextValue>(
    () => ({
      tooltipData: value.tooltipData,
      setTooltipData: value.setTooltipData,
      selection: value.selection,
      clearSelection: value.clearSelection,
      hoveredBarIndex: value.hoveredBarIndex,
      setHoveredBarIndex: value.setHoveredBarIndex,
      hoveredCandleIndex: value.hoveredCandleIndex,
      setHoveredCandleIndex: value.setHoveredCandleIndex,
    }),
    [
      value.tooltipData,
      value.setTooltipData,
      value.selection,
      value.clearSelection,
      value.hoveredBarIndex,
      value.setHoveredBarIndex,
      value.hoveredCandleIndex,
      value.setHoveredCandleIndex,
    ]
  );

  return (
    <ChartStableContext.Provider value={stable}>
      <ChartHoverContext.Provider value={hover}>
        {children}
      </ChartHoverContext.Provider>
    </ChartStableContext.Provider>
  );
}

/**
 * Stable slice — data, scales, dimensions, etc. Subscribers skip re-renders
 * on hover (the hover slice lives in a separate context). Prefer this in
 * cold consumers like axes, grid, pattern fills.
 */
export function useChartStable(): ChartStableContextValue {
  const context = useContext(ChartStableContext);
  if (!context) {
    throw new Error(
      'useChartStable must be used within a ChartProvider. ' +
        'Make sure your component is wrapped in <LineChart>, <AreaChart>, <BarChart>, or <ComposedChart>.'
    );
  }
  return context;
}

/**
 * Hover slice — tooltipData, selection, hovered bar / candle indices.
 * Subscribers re-render on every mouse move. Use only when the component
 * actually reads hover state.
 */
export function useChartHover(): ChartHoverContextValue {
  const context = useContext(ChartHoverContext);
  if (!context) {
    throw new Error(
      'useChartHover must be used within a ChartProvider. ' +
        'Make sure your component is wrapped in <LineChart>, <AreaChart>, <BarChart>, or <ComposedChart>.'
    );
  }
  return context;
}

/**
 * Merged stable + hover context. Convenient for components that need both,
 * but re-renders on every hover (because hover changes). Prefer
 * `useChartStable()` or `useChartHover()` for hot consumers that only need
 * one slice.
 */
export function useChart(): ChartContextValue {
  const stable = useChartStable();
  const hover = useChartHover();
  // Identity changes on every hover (hover is the volatile slice) — that's
  // fine for consumers using this merged hook; they explicitly opted in to
  // re-rendering on hover.
  return { ...stable, ...hover };
}

export default ChartStableContext;
