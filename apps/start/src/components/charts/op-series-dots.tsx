import { motion, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChart } from './chart-context';

const SPRING = { stiffness: 1000, damping: 60 };

export interface OPSeriesDotConfig {
  /** dataKey of the series this dot belongs to. */
  dataKey: string;
  /** Fill color of the dot. */
  color: string;
  /** Optional 1-character label (e.g. "$") drawn inside the dot. */
  label?: string;
  /** Dot radius. Defaults to 5 (8 when `label` is set). */
  radius?: number;
}

interface OPSeriesDotsProps {
  dots: OPSeriesDotConfig[];
}

/**
 * Custom hover dots for bklit charts. Use when you need per-series styling
 * (e.g. a "$" inside the revenue dot) — bklit's `<TooltipDot>` is fixed-shape.
 *
 * Portals to the chart container above the crosshair (z-[51] > bklit's z-50)
 * so dots stay visible on top of the vertical crosshair indicator.
 *
 * Pair with `showDots={false}` on `<OPChartTooltip>` so dots aren't drawn twice.
 */
export function OPSeriesDots({ dots }: OPSeriesDotsProps) {
  const { tooltipData, containerRef, margin } = useChart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!(mounted && containerRef.current && tooltipData)) {
    return null;
  }

  return createPortal(
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[51]"
      height="100%"
      width="100%"
    >
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {dots.map((dot) => {
          const xPos = tooltipData.xPositions?.[dot.dataKey] ?? tooltipData.x;
          const yPos = tooltipData.yPositions[dot.dataKey];
          if (yPos == null) {
            return null;
          }
          const radius = dot.radius ?? (dot.label ? 8 : 5);
          return (
            <OPDot
              color={dot.color}
              key={dot.dataKey}
              label={dot.label}
              radius={radius}
              x={xPos}
              y={yPos}
            />
          );
        })}
      </g>
    </svg>,
    containerRef.current
  );
}

interface OPDotProps {
  x: number;
  y: number;
  color: string;
  label?: string;
  radius: number;
}

function OPDot({ x, y, color, label, radius }: OPDotProps) {
  const animatedX = useSpring(x, SPRING);
  const animatedY = useSpring(y, SPRING);
  animatedX.set(x);
  animatedY.set(y);

  return (
    <motion.g style={{ x: animatedX, y: animatedY }}>
      <circle
        fill={color}
        r={radius}
        stroke="var(--chart-background)"
        strokeWidth={2}
      />
      {label && (
        <text
          dy={radius * 0.35}
          fill="white"
          fontSize={radius * 1.2}
          fontWeight={700}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </motion.g>
  );
}
