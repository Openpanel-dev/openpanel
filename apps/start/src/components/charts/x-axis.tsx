'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChart } from './chart-context';
import { cn } from '@/lib/utils';

export interface XAxisProps {
  /** Number of ticks to show (including first and last). Default: 5. Used when `tickMode` is `"domain"`. */
  numTicks?: number;
  /** Width of the date ticker box for fade calculation. Default: 50 */
  tickerHalfWidth?: number;
  /**
   * `"domain"` — evenly spaced ticks across the time domain (default).
   * `"data"` — one label per data row at its x value (better with sparse or monthly bars).
   */
  tickMode?: 'domain' | 'data';
}

interface XAxisLabelProps {
  label: string;
  x: number;
  crosshairX: number | null;
  isHovering: boolean;
  tickerHalfWidth: number;
}

function XAxisLabel({
  label,
  x,
  crosshairX,
  isHovering,
  tickerHalfWidth,
}: XAxisLabelProps) {
  const fadeBuffer = 20;
  const fadeRadius = tickerHalfWidth + fadeBuffer;

  let opacity = 1;
  if (isHovering && crosshairX !== null) {
    const distance = Math.abs(x - crosshairX);
    if (distance < tickerHalfWidth) {
      opacity = 0;
    } else if (distance < fadeRadius) {
      opacity = (distance - tickerHalfWidth) / fadeBuffer;
    }
  }

  return (
    <div
      className="absolute"
      style={{
        left: x,
        bottom: 12,
        width: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <span
        className={cn('whitespace-nowrap text-chart-label text-xs')}
        style={{
          opacity,
          transition: 'opacity 0.4s ease-in-out',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Outer wrapper owns the mount guard. The expensive `labelsToShow` memo
 * (which iterates `data` or builds `numTicks` ticks) lives in the memoized
 * inner component — so it doesn't run on every render before the portal
 * container is attached, and skips when props haven't changed.
 */
export function XAxis({
  numTicks = 5,
  tickerHalfWidth = 50,
  tickMode = 'domain',
}: XAxisProps) {
  const { containerRef } = useChart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  return (
    <XAxisInner
      container={container}
      numTicks={numTicks}
      tickMode={tickMode}
      tickerHalfWidth={tickerHalfWidth}
    />
  );
}

const XAxisInner = memo(function XAxisInner({
  container,
  numTicks,
  tickMode,
  tickerHalfWidth,
}: {
  container: HTMLElement;
  numTicks: number;
  tickMode: 'domain' | 'data';
  tickerHalfWidth: number;
}) {
  const { xScale, margin, tooltipData, data, xAccessor, dateLabels } =
    useChart();

  const labelsToShow = useMemo(() => {
    if (tickMode === 'data') {
      return data.map((d, i) => ({
        date: xAccessor(d),
        x: (xScale(xAccessor(d)) ?? 0) + margin.left,
        label:
          dateLabels[i] ??
          xAccessor(d).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
      }));
    }

    const domain = xScale.domain();
    const startDate = domain[0];
    const endDate = domain[1];

    if (!(startDate && endDate)) {
      return [];
    }

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    const timeRange = endTime - startTime;

    const tickCount = Math.max(2, numTicks);
    const dates: Date[] = [];

    for (let i = 0; i < tickCount; i++) {
      const t = i / (tickCount - 1);
      const time = startTime + t * timeRange;
      dates.push(new Date(time));
    }

    return dates.map((date) => ({
      date,
      x: (xScale(date) ?? 0) + margin.left,
      label: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    }));
  }, [tickMode, data, xAccessor, xScale, margin.left, dateLabels, numTicks]);

  const isHovering = tooltipData !== null;
  const crosshairX = tooltipData ? tooltipData.x + margin.left : null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {labelsToShow.map((item) => (
        <XAxisLabel
          crosshairX={crosshairX}
          isHovering={isHovering}
          key={`${item.date.getTime()}-${item.x}`}
          label={item.label}
          tickerHalfWidth={tickerHalfWidth}
          x={item.x}
        />
      ))}
    </div>,
    container
  );
});

XAxis.displayName = 'XAxis';

export default XAxis;
