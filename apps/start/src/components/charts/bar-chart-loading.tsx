'use client';

import { BarChart } from './bar-chart';
import type { Margin } from './chart-context';

const EMPTY_DATA: Record<string, unknown>[] = [];

export interface BarChartLoadingProps {
  /** Chart margins. */
  margin?: Partial<Margin>;
  /** Aspect ratio as "width / height". Default: "2 / 1" */
  aspectRatio?: string;
  /** Additional class name for the container. */
  className?: string;
}

/**
 * Turnkey loading skeleton for bar charts, a thin shortcut for
 * `<BarChart status="loading" />`. Renders shimmer-swept placeholder bars while
 * data is fetching; swap in a real `<BarChart>` once it resolves.
 */
export function BarChartLoading({
  margin,
  aspectRatio = '2 / 1',
  className = '',
}: BarChartLoadingProps) {
  return (
    <BarChart
      aspectRatio={aspectRatio}
      className={className}
      data={EMPTY_DATA}
      margin={margin}
      status="loading"
    />
  );
}

export default BarChartLoading;
