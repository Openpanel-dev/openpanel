'use client';

import { scaleLinear, scaleTime } from '@visx/scale';
import { bisector } from 'd3-array';
import type { Transition } from 'motion/react';
import {
  Children,
  isValidElement,
  memo,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DEFAULT_ANIMATION_EASING } from './animation';
import { ChartProvider, type LineConfig, type Margin } from './chart-context';
import { isGradientDefComponent, isPatternDefComponent } from './chart-defs';
import { shortDateFmt } from './chart-formatters';
import { useChartInteraction } from './use-chart-interaction';

/** Markers render after the interaction overlay so they stay clickable. */
export function isPostOverlayComponent(child: ReactElement): boolean {
  const childType = child.type as {
    displayName?: string;
    name?: string;
    __isChartMarkers?: boolean;
  };

  if (childType.__isChartMarkers) {
    return true;
  }

  const componentName =
    typeof child.type === 'function'
      ? childType.displayName || childType.name || ''
      : '';

  return componentName === 'ChartMarkers' || componentName === 'MarkerGroup';
}

export interface TimeSeriesChartInnerProps {
  width: number;
  height: number;
  data: Record<string, unknown>[];
  xDataKey: string;
  margin: Margin;
  animationDuration: number;
  animationEasing?: string;
  enterTransition?: Transition;
  /** Signature of motion URL state — triggers reveal replay when it changes. */
  revealSignature?: string;
  children: ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Series keys driving y-domain and tooltip (Line / Area / SeriesBar configs). */
  lines: LineConfig[];
  /** SVG clipPath id for grow animation. */
  clipPathId: string;
  /** Optional ComposedChart bar layout (forwarded into context). */
  composedBarDataKeys?: string[];
  composedBarSize?: number;
  composedMaxBarSize?: number;
  composedBarGap?: number;
  composedStacked?: boolean;
  composedStackOffsets?: Map<number, Map<string, number>>;
  composedStackGap?: number;
  /** When set, drives the y-axis max instead of scanning `lines` (e.g. stacked bar totals). */
  yScaleDomainMax?: number;
}

/**
 * Outer wrapper owns the dimension guard. All scales / accessors / interaction
 * hooks live in the memoized core — so a hidden chart (width < 10) builds zero
 * d3 scales, runs zero useMemos, and never instantiates useChartInteraction.
 * When the core does mount, the memo() boundary skips re-renders when the
 * parent passes the same props (common case for static dashboard panels).
 */
export function TimeSeriesChartInner(props: TimeSeriesChartInnerProps) {
  if (props.width < 10 || props.height < 10) {
    return null;
  }
  return <TimeSeriesChartCore {...props} />;
}

const TimeSeriesChartCore = memo(function TimeSeriesChartCore({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  animationEasing = DEFAULT_ANIMATION_EASING,
  enterTransition,
  revealSignature = '',
  children,
  containerRef,
  lines,
  clipPathId: _clipPathId,
  composedBarDataKeys,
  composedBarSize,
  composedMaxBarSize,
  composedBarGap,
  composedStacked,
  composedStackOffsets,
  composedStackGap,
  yScaleDomainMax,
}: TimeSeriesChartInnerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [revealEpoch, setRevealEpoch] = useState(0);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xAccessor = useCallback(
    (d: Record<string, unknown>): Date => {
      const value = d[xDataKey];
      return value instanceof Date ? value : new Date(value as string | number);
    },
    [xDataKey]
  );

  const bisectDate = useMemo(
    () => bisector<Record<string, unknown>, Date>((d) => xAccessor(d)).left,
    [xAccessor]
  );

  const xScale = useMemo(() => {
    const dates = data.map((d) => xAccessor(d));
    const minTime = Math.min(...dates.map((d) => d.getTime()));
    const maxTime = Math.max(...dates.map((d) => d.getTime()));

    return scaleTime({
      range: [0, innerWidth],
      domain: [minTime, maxTime],
    });
  }, [innerWidth, data, xAccessor]);

  const columnWidth = useMemo(() => {
    if (data.length < 2) {
      return 0;
    }
    return innerWidth / (data.length - 1);
  }, [innerWidth, data.length]);

  const yScale = useMemo(() => {
    let maxValue = 0;
    if (yScaleDomainMax != null && yScaleDomainMax > 0) {
      maxValue = yScaleDomainMax;
    } else {
      for (const line of lines) {
        for (const d of data) {
          const value = d[line.dataKey];
          if (typeof value === 'number' && value > maxValue) {
            maxValue = value;
          }
        }
      }

      if (maxValue === 0) {
        maxValue = 100;
      }
    }

    return scaleLinear({
      range: [innerHeight, 0],
      domain: [0, maxValue * 1.1],
      nice: true,
    });
  }, [innerHeight, data, lines, yScaleDomainMax]);

  const dateLabels = useMemo(
    () => data.map((d) => shortDateFmt.format(xAccessor(d))),
    [data, xAccessor]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: revealSignature
  useEffect(() => {
    setRevealEpoch((n) => n + 1);
    setIsLoaded(false);
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, animationDuration);
    return () => clearTimeout(timer);
  }, [animationDuration, revealSignature]);

  const canInteract = isLoaded;

  const {
    tooltipData,
    setTooltipData,
    selection,
    clearSelection,
    interactionHandlers,
    interactionStyle,
  } = useChartInteraction({
    xScale,
    yScale,
    data,
    lines,
    margin,
    xAccessor,
    bisectDate,
    canInteract,
  });

  const { defsChildren, preOverlayChildren, postOverlayChildren } =
    useMemo(() => {
      const defs: ReactElement[] = [];
      const pre: ReactElement[] = [];
      const post: ReactElement[] = [];
      Children.forEach(children, (child) => {
        if (!isValidElement(child)) {
          return;
        }
        if (isGradientDefComponent(child)) {
          defs.push(child);
        } else if (isPatternDefComponent(child)) {
          // Keep pattern defs in the plot <g> (same as main) — hoisting breaks url(#id) fills.
          pre.push(child);
        } else if (isPostOverlayComponent(child)) {
          post.push(child);
        } else {
          pre.push(child);
        }
      });
      return {
        defsChildren: defs,
        preOverlayChildren: pre,
        postOverlayChildren: post,
      };
    }, [children]);

  // Memoize the context value so identity is stable when its contents don't
  // change. Without this, every render allocates a fresh object and forces
  // all useContext(ChartContext) consumers (Line, Area, OPReferences, etc.)
  // to re-render even when no actual state moved.
  const contextValue = useMemo(
    () => ({
      data,
      xScale,
      yScale,
      width,
      height,
      innerWidth,
      innerHeight,
      margin,
      columnWidth,
      tooltipData,
      setTooltipData,
      containerRef,
      lines,
      isLoaded,
      animationDuration,
      animationEasing,
      enterTransition,
      revealEpoch,
      xAccessor,
      dateLabels,
      selection,
      clearSelection,
      composedBarDataKeys,
      composedBarSize,
      composedMaxBarSize,
      composedBarGap,
      composedStacked,
      composedStackOffsets,
      composedStackGap,
    }),
    [
      data,
      xScale,
      yScale,
      width,
      height,
      innerWidth,
      innerHeight,
      margin,
      columnWidth,
      tooltipData,
      setTooltipData,
      containerRef,
      lines,
      isLoaded,
      animationDuration,
      animationEasing,
      enterTransition,
      revealEpoch,
      xAccessor,
      dateLabels,
      selection,
      clearSelection,
      composedBarDataKeys,
      composedBarSize,
      composedMaxBarSize,
      composedBarGap,
      composedStacked,
      composedStackOffsets,
      composedStackGap,
    ]
  );

  return (
    <ChartProvider value={contextValue}>
      <svg
        aria-hidden="true"
        height={height}
        style={{ overflow: 'visible' }}
        width={width}
      >
        {defsChildren.length > 0 && <defs>{defsChildren}</defs>}

        <rect fill="transparent" height={height} width={width} x={0} y={0} />

        <g
          {...interactionHandlers}
          style={interactionStyle}
          transform={`translate(${margin.left},${margin.top})`}
        >
          <rect
            fill="transparent"
            height={innerHeight}
            width={innerWidth}
            x={0}
            y={0}
          />

          {preOverlayChildren}
          {postOverlayChildren}
        </g>
      </svg>
    </ChartProvider>
  );
});
