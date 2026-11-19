'use client';

import { motion, useSpring, useTransform } from 'motion/react';
import { type SpringConfig, useChartConfig } from '../chart-config-context';
import { chartCssVars } from '../chart-context';

export interface TooltipDotProps {
  x: number;
  y: number;
  visible: boolean;
  color: string;
  /** Core dot radius; half-extent for ring squares. Default: 5 */
  size?: number;
  /** Outline color for the `dot` variant. Default: `var(--chart-background)` */
  strokeColor?: string;
  /**
   * `dot`: outline width around the core (default `0`, no outline).
   * `ring`: ring stroke width (default `1.5`).
   */
  strokeWidth?: number;
  /**
   * `dot` variant: halo radius as a multiple of `size`. The halo is a soft disc
   * in the series color behind the core. `0` hides it. Default: `2.6`
   */
  haloScale?: number;
  /** `dot` variant: halo opacity (0–1). Default: `0.3` */
  haloOpacity?: number;
  /** Dot fill or transparent ring around the hovered mark. Default: "dot" */
  variant?: 'dot' | 'ring';
  /**
   * Ring corner radius as a fraction of side length (0 = square, 0.5 = circle).
   * Same semantics as bar square radius.
   */
  cornerRadiusFraction?: number;
  /** Per-chart override; falls back to `ChartConfigProvider.tooltipSpring`. */
  springConfig?: SpringConfig;
  /** Animate position with a spring. Default: true */
  animate?: boolean;
}

const DEFAULT_HALO_SCALE = 2.6;
const DEFAULT_HALO_OPACITY = 0.3;
/** Entrance spring for the core + halo radius (position uses the tooltip spring). */
const HALO_SPRING = { type: 'spring', stiffness: 420, damping: 28 } as const;

function ringCornerRadius(
  halfExtent: number,
  cornerRadiusFraction: number
): number {
  const side = halfExtent * 2;
  return side * Math.max(0, Math.min(0.5, cornerRadiusFraction));
}

function AnimatedRingDot({
  x,
  y,
  halfExtent,
  cornerRadiusFraction,
  fill,
  stroke,
  strokeWidth,
  springConfig,
}: {
  x: number;
  y: number;
  halfExtent: number;
  cornerRadiusFraction: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  springConfig?: SpringConfig;
}) {
  const { tooltipSpring } = useChartConfig();
  const effectiveSpring = springConfig ?? tooltipSpring;
  const animatedX = useSpring(x, effectiveSpring);
  const animatedY = useSpring(y, effectiveSpring);
  const side = halfExtent * 2;
  const rx = ringCornerRadius(halfExtent, cornerRadiusFraction);
  const rectX = useTransform(animatedX, (value) => value - halfExtent);
  const rectY = useTransform(animatedY, (value) => value - halfExtent);

  animatedX.set(x);
  animatedY.set(y);

  return (
    <motion.rect
      fill={fill}
      height={side}
      rx={rx}
      ry={rx}
      stroke={stroke}
      strokeWidth={strokeWidth}
      width={side}
      x={rectX}
      y={rectY}
    />
  );
}

export function TooltipDot({
  x,
  y,
  visible,
  color,
  size = 5,
  strokeColor = chartCssVars.background,
  strokeWidth,
  haloScale = DEFAULT_HALO_SCALE,
  haloOpacity = DEFAULT_HALO_OPACITY,
  variant = 'dot',
  cornerRadiusFraction = 0.25,
  springConfig,
  animate = true,
}: TooltipDotProps) {
  const { tooltipSpring } = useChartConfig();
  const effectiveSpring = springConfig ?? tooltipSpring;
  const animatedX = useSpring(x, effectiveSpring);
  const animatedY = useSpring(y, effectiveSpring);

  const isRing = variant === 'ring';

  if (animate && !isRing) {
    animatedX.set(x);
    animatedY.set(y);
  }

  if (!visible) {
    return null;
  }

  if (isRing) {
    const ringStrokeWidth = strokeWidth ?? 1.5;
    if (animate) {
      return (
        <AnimatedRingDot
          cornerRadiusFraction={cornerRadiusFraction}
          fill="transparent"
          halfExtent={size}
          springConfig={springConfig}
          stroke={color}
          strokeWidth={ringStrokeWidth}
          x={x}
          y={y}
        />
      );
    }

    const side = size * 2;
    const rx = ringCornerRadius(size, cornerRadiusFraction);

    return (
      <rect
        fill="transparent"
        height={side}
        rx={rx}
        ry={rx}
        stroke={color}
        strokeWidth={ringStrokeWidth}
        width={side}
        x={x - size}
        y={y - size}
      />
    );
  }

  const outlineWidth = strokeWidth ?? 0;
  const outline =
    outlineWidth > 0
      ? { stroke: strokeColor, strokeWidth: outlineWidth }
      : undefined;
  const haloRadius = Math.max(0, size * haloScale);
  const showHalo = haloRadius > size && haloOpacity > 0;

  if (!animate) {
    return (
      <g>
        {showHalo && (
          <circle
            cx={x}
            cy={y}
            fill={color}
            fillOpacity={haloOpacity}
            r={haloRadius}
          />
        )}
        <circle cx={x} cy={y} fill={color} r={size} {...outline} />
      </g>
    );
  }

  return (
    <g>
      {showHalo && (
        <motion.circle
          animate={{ r: haloRadius }}
          cx={animatedX}
          cy={animatedY}
          fill={color}
          fillOpacity={haloOpacity}
          initial={{ r: size }}
          transition={HALO_SPRING}
        />
      )}
      <motion.circle
        animate={{ r: size }}
        cx={animatedX}
        cy={animatedY}
        fill={color}
        initial={{ r: size * 0.5 }}
        transition={HALO_SPRING}
        {...outline}
      />
    </g>
  );
}

TooltipDot.displayName = 'TooltipDot';

export default TooltipDot;
