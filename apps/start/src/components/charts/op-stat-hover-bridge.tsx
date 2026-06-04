import { useEffect } from 'react';
import { useChart } from './chart-context';

export interface OPStatHoverState<T extends Record<string, unknown>> {
  /** Index of the hovered data point (null on mouse-leave). */
  index: number | null;
  /** The hovered data point (null on mouse-leave). */
  point: T | null;
}

interface OPStatHoverBridgeProps<T extends Record<string, unknown>> {
  onHoverChange: (state: OPStatHoverState<T>) => void;
}

/**
 * Tiny no-render child that lifts a bklit chart's hovered point out of context
 * and into parent state. Pair with `<ChartStatFlow>` (or any other display
 * primitive) to swap the visible value to the hovered one — used by stat cards
 * that don't want a popup tooltip.
 *
 * Modeled on bklit's `StatCardHoverBridge` from
 * `/Users/lindesvard/Projects/bklit-ui/apps/web/blocks/stat-card-area-01/`.
 */
export function OPStatHoverBridge<T extends Record<string, unknown>>({
  onHoverChange,
}: OPStatHoverBridgeProps<T>) {
  const { tooltipData } = useChart();
  const index = tooltipData?.index ?? null;
  const point = (tooltipData?.point as T | undefined) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire when hovered point changes
  useEffect(() => {
    onHoverChange({ index, point });
  }, [index, point]);

  return null;
}
