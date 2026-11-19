'use client';

import { memo } from 'react';
import { TooltipBox } from '../tooltip/tooltip-box';
import { TooltipHeader } from '../tooltip/tooltip-content';
import { useHeatmap, useHeatmapInteraction } from './heatmap-context';
import {
  formatHeatmapContributionLabel,
  formatHeatmapTooltipDate,
  formatHeatmapTooltipWeekday,
} from './heatmap-utils';
import { useDelayedTooltipData } from './use-delayed-tooltip-data';

export interface HeatmapTooltipProps {
  /** Custom contribution line (bottom section). Default: `N contribution(s)`. */
  formatLabel?: (count: number, date: Date) => string;
  /** Custom class name */
  className?: string;
  /** Inline styles for the tooltip panel (background, blur, etc.). */
  panelStyle?: React.CSSProperties;
  /**
   * Tooltip panel background color (CSS variable or color value).
   * Default: `var(--chart-tooltip-background)`.
   */
  backgroundColor?: string;
  /**
   * Delay before showing the tooltip on first hover (ms).
   * Moving between cells updates immediately once visible.
   */
  showDelay?: number;
  /**
   * Grace period before hiding when the pointer leaves a cell (ms).
   * Helps avoid flicker when moving quickly between adjacent cells.
   */
  hideDelay?: number;
  /**
   * When true, the tooltip appears and disappears instantly with no motion.
   */
  instant?: boolean;
}

export const HeatmapTooltip = memo(function HeatmapTooltip({
  formatLabel = formatHeatmapContributionLabel,
  className = '',
  panelStyle,
  backgroundColor,
  showDelay = 0,
  hideDelay = 120,
  instant = false,
}: HeatmapTooltipProps) {
  const { containerRef, width, height } = useHeatmap();
  const { tooltipData } = useHeatmapInteraction();
  const displayData = useDelayedTooltipData(tooltipData, showDelay, hideDelay);

  if (!displayData) {
    return null;
  }

  const { count, date } = displayData;

  return (
    <TooltipBox
      animate={false}
      backgroundColor={backgroundColor}
      className={className}
      containerHeight={height}
      containerRef={containerRef}
      containerWidth={width}
      entrance={!instant}
      panelStyle={panelStyle}
      visible
      x={displayData.x}
      y={displayData.y}
    >
      <TooltipHeader>
        {formatHeatmapTooltipDate(date)}
        <div className="mt-0.5 font-normal text-chart-tooltip-muted text-xs">
          {formatHeatmapTooltipWeekday(date)}
        </div>
      </TooltipHeader>
      <div className="px-3 py-2.5 text-left text-chart-tooltip-foreground text-sm">
        {formatLabel(count, date)}
      </div>
    </TooltipBox>
  );
});

HeatmapTooltip.displayName = 'HeatmapTooltip';

export default HeatmapTooltip;
