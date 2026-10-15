'use client';

import { motion } from 'motion/react';
import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  defaultHeatmapColorScale,
  type HeatmapLevelStyles,
} from './heatmap-colors';
import { useHeatmapInteractionOptional } from './heatmap-context';
import { HeatmapLegendGradient } from './heatmap-legend-gradient';
import { HeatmapLegendSwatch } from './heatmap-legend-swatch';
import {
  getHeatmapContributionLevel,
  isHeatmapHoverEffectEnabled,
  resolveHeatmapHoverStyle,
} from './heatmap-utils';

export const HEATMAP_LEGEND_LEVELS = [0, 1, 2, 3, 4] as const;

const HEATMAP_INACTIVE_OPACITY = 0.3;
/** Smooth tween for inactive opacity + scale on hover. */
const HEATMAP_INACTIVE_TRANSITION = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1] as const,
};

export type HeatmapLegendVariant = 'swatches' | 'gradient';

export interface HeatmapLegendProps {
  /** Side label before the swatches. Default: "Less" */
  lessLabel?: string;
  /** Side label after the swatches. Default: "More" */
  moreLabel?: string;
  /** Swatch size in pixels. Default: 11 */
  cellSize?: number;
  /** Gap between swatches. Default: 2 */
  gap?: number;
  /** Corner radius for swatches. Default: 2 */
  cornerRadius?: number;
  /** Horizontal alignment within the legend cell. Default: "end" */
  align?: 'start' | 'center' | 'end';
  /** Legend layout — discrete swatches or a continuous gradient bar. Default: `"swatches"` */
  variant?: HeatmapLegendVariant;
  /** Gradient bar width in swatch units when `variant="gradient"`. Default: 5 */
  gradientSpan?: number;
  /** Font size in pixels for side labels. */
  fontSize?: number;
  /** Additional class name for less/more labels. */
  labelClassName?: string;
  /** Shared level styles for cells and legend swatches. */
  levelStyles?: HeatmapLevelStyles;
  /** Override the default color scale (used when `levelStyles` is omitted). */
  colorScale?: (count: number | null | undefined) => string;
  /** Opacity for inactive swatches while interacting. Default: 0.3 */
  inactiveOpacity?: number;
  /** Scale for inactive swatches while interacting. Default: 1 */
  inactiveScale?: number;
  /** Scale for the highlighted swatch while interacting. Default: 1 */
  activeScale?: number;
  /** Sync dimming with chart hover. Default: true when inside HeatmapInteractionProvider */
  interactive?: boolean;
  className?: string;
}

export const HeatmapLegend = memo(function HeatmapLegend({
  lessLabel = 'Less',
  moreLabel = 'More',
  cellSize = 11,
  gap = 2,
  cornerRadius = 2,
  align = 'end',
  variant = 'swatches',
  gradientSpan = 5,
  fontSize,
  labelClassName,
  levelStyles: levelStylesProp,
  colorScale = defaultHeatmapColorScale,
  inactiveOpacity = HEATMAP_INACTIVE_OPACITY,
  inactiveScale = 1,
  activeScale = 1,
  interactive,
  className,
}: HeatmapLegendProps) {
  const interaction = useHeatmapInteractionOptional();
  const isInteractive = interactive ?? interaction != null;
  const levelStyles =
    levelStylesProp ??
    (HEATMAP_LEGEND_LEVELS.map((level) => ({
      color: colorScale(level),
      fillMode: 'solid' as const,
      pattern: 'none' as const,
    })) as unknown as HeatmapLevelStyles);

  const {
    hoveredLegendLevel,
    tooltipData,
    setHoveredCell,
    setHoveredLegendLevel,
    setTooltipData,
  } = interaction ?? {
    hoveredLegendLevel: null,
    tooltipData: null,
    setHoveredCell: () => undefined,
    setHoveredLegendLevel: () => undefined,
    setTooltipData: () => undefined,
  };

  const highlightedLevel =
    hoveredLegendLevel ??
    (tooltipData ? getHeatmapContributionLevel(tooltipData.count) : null);
  const hoverParams = { inactiveOpacity, inactiveScale, activeScale };
  const inactiveEnabled = isHeatmapHoverEffectEnabled(hoverParams);
  const isDimming =
    isInteractive && highlightedLevel !== null && inactiveEnabled;

  const handleLegendEnter = useCallback(
    (level: number) => {
      if (!isInteractive) {
        return;
      }

      setHoveredLegendLevel(level);
      setHoveredCell(null);
      setTooltipData(null);
    },
    [isInteractive, setHoveredCell, setHoveredLegendLevel, setTooltipData]
  );

  const handleLegendLeave = useCallback(() => {
    if (!isInteractive) {
      return;
    }

    setHoveredLegendLevel(null);
  }, [isInteractive, setHoveredLegendLevel]);

  const labelStyle = fontSize == null ? undefined : { fontSize };

  return (
    <div
      className={cn(
        'flex w-full items-center gap-1.5 text-chart-label text-xs',
        align === 'start' && 'justify-start',
        align === 'center' && 'justify-center',
        align === 'end' && 'justify-end',
        className
      )}
      style={labelStyle}
    >
      <span className={labelClassName}>{lessLabel}</span>
      {variant === 'gradient' ? (
        <HeatmapLegendGradient
          activeScale={activeScale}
          cellSize={cellSize}
          cornerRadius={cornerRadius}
          gap={gap}
          gradientSpan={gradientSpan}
          highlightedLevel={highlightedLevel}
          inactiveOpacity={inactiveOpacity}
          inactiveScale={inactiveScale}
          isDimming={isDimming}
          isInteractive={isInteractive}
          levelStyles={levelStyles}
          levels={HEATMAP_LEGEND_LEVELS}
          onEnter={handleLegendEnter}
          onLeave={handleLegendLeave}
        />
      ) : (
        <div className="flex items-center" style={{ gap }}>
          {HEATMAP_LEGEND_LEVELS.map((level) => {
            const isHighlighted = highlightedLevel === level;
            const isDimmed = isDimming && !isHighlighted;
            const hoverStyle = resolveHeatmapHoverStyle(
              isHighlighted,
              isDimmed,
              hoverParams
            );
            const style = levelStyles[level];

            return (
              <motion.span
                animate={{
                  opacity: hoverStyle.opacity,
                  scale: hoverStyle.scale,
                }}
                aria-hidden="true"
                className="block shrink-0 leading-none"
                initial={{ opacity: 1, scale: 1 }}
                key={level}
                onPointerEnter={() => handleLegendEnter(level)}
                onPointerLeave={handleLegendLeave}
                style={{
                  cursor: isInteractive ? 'pointer' : undefined,
                }}
                transition={HEATMAP_INACTIVE_TRANSITION}
              >
                <HeatmapLegendSwatch
                  cellSize={cellSize}
                  cornerRadius={cornerRadius}
                  level={level}
                  style={style}
                />
              </motion.span>
            );
          })}
        </div>
      )}
      <span className={labelClassName}>{moreLabel}</span>
    </div>
  );
});

HeatmapLegend.displayName = 'HeatmapLegend';

export default HeatmapLegend;
