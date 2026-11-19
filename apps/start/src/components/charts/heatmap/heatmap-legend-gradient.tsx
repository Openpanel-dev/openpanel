'use client';

import { motion } from 'motion/react';
import { memo } from 'react';
import type { HeatmapLevelStyles } from './heatmap-colors';
import {
  buildHeatmapLegendGradient,
  resolveHeatmapHoverStyle,
} from './heatmap-utils';

const HEATMAP_INACTIVE_TRANSITION = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1] as const,
};

export interface HeatmapLegendGradientProps {
  levels: readonly number[];
  levelStyles: HeatmapLevelStyles;
  cellSize: number;
  gap: number;
  cornerRadius: number;
  gradientSpan: number;
  highlightedLevel: number | null;
  isDimming: boolean;
  inactiveOpacity: number;
  inactiveScale: number;
  activeScale: number;
  isInteractive: boolean;
  onEnter: (level: number) => void;
  onLeave: () => void;
}

export const HeatmapLegendGradient = memo(function HeatmapLegendGradient({
  levels,
  levelStyles,
  cellSize,
  gap,
  cornerRadius,
  gradientSpan,
  highlightedLevel,
  isDimming,
  inactiveOpacity,
  inactiveScale,
  activeScale,
  isInteractive,
  onEnter,
  onLeave,
}: HeatmapLegendGradientProps) {
  const barWidth = gradientSpan * cellSize + (gradientSpan - 1) * gap;
  const barHeight = cellSize;
  const pillRadius = Math.min(cornerRadius, barHeight / 2);
  const segmentWidth = barWidth / levels.length;
  const gradient = buildHeatmapLegendGradient(levelStyles);

  return (
    <div
      className="relative shrink-0"
      style={{ width: barWidth, height: barHeight }}
    >
      <motion.div
        animate={{
          opacity: isDimming && highlightedLevel === null ? inactiveOpacity : 1,
          scale: 1,
        }}
        aria-hidden="true"
        className="absolute inset-0"
        initial={{ opacity: 1, scale: 1 }}
        style={{
          borderRadius: pillRadius,
          background: gradient,
        }}
        transition={HEATMAP_INACTIVE_TRANSITION}
      />
      {levels.map((level, index) => {
        const isHighlighted = highlightedLevel === level;
        const isDimmed = isDimming && !isHighlighted;
        const hoverStyle = resolveHeatmapHoverStyle(isHighlighted, isDimmed, {
          inactiveOpacity,
          inactiveScale,
          activeScale,
        });

        return (
          <motion.span
            animate={{
              opacity: hoverStyle.opacity,
              scale: hoverStyle.scale,
            }}
            className="absolute top-0 block"
            initial={{ opacity: 1, scale: 1 }}
            key={level}
            onPointerEnter={() => onEnter(level)}
            onPointerLeave={onLeave}
            style={{
              left: index * segmentWidth,
              width: segmentWidth,
              height: barHeight,
              cursor: isInteractive ? 'pointer' : undefined,
              transformOrigin: 'center center',
            }}
            transition={HEATMAP_INACTIVE_TRANSITION}
          />
        );
      })}
    </div>
  );
});

HeatmapLegendGradient.displayName = 'HeatmapLegendGradient';

export default HeatmapLegendGradient;
