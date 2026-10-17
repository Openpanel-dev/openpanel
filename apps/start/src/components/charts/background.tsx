'use client';

import { motion } from 'motion/react';
import { useId, useMemo } from 'react';
import { useChartStable } from './chart-context';
import {
  type PatternPresetId,
  type PatternPresetOptions,
  renderPatternPreset,
} from './pattern-preset';

export type BackgroundPatternPreset = PatternPresetId;

export interface BackgroundProps extends PatternPresetOptions {
  /** Pattern preset. `"none"` renders nothing. */
  pattern?: BackgroundPatternPreset;
  /** Pattern stroke color. Default: `var(--chart-grid)` */
  color?: string;
  /** Apply the pattern texture to the plot area. Default: true */
  showFill?: boolean;
  /** Pattern fill opacity. Default: 1 */
  opacity?: number;
  /** Fade pattern at the left and right chart edges. Default: true */
  fadeHorizontal?: boolean;
  /** Fade pattern at the top and bottom chart edges. Default: true */
  fadeVertical?: boolean;
  /** Horizontal fade zone as % of plot width per edge. Default: 10 */
  fadeHorizontalLength?: number;
  /** Vertical fade zone as % of plot height per edge. Default: 10 */
  fadeVerticalLength?: number;
}

const BACKGROUND_ENTER_FADE_MS = 420;

function clampFadeLength(length: number): number {
  return Math.min(45, Math.max(0, length));
}

function fadeMaskStops(lengthPercent: number): Array<{
  offset: string;
  opacity: number;
}> {
  const edge = clampFadeLength(lengthPercent);
  return [
    { offset: '0%', opacity: 0 },
    { offset: `${edge}%`, opacity: 1 },
    { offset: `${100 - edge}%`, opacity: 1 },
    { offset: '100%', opacity: 0 },
  ];
}

/** Plot-area pattern fill for charts without a grid. Renders behind series layers. */
export function Background({
  pattern = 'diagonal',
  color = 'var(--chart-grid)',
  scale = 1,
  strokeWidth,
  radius,
  complement,
  fill,
  dotFill,
  tileBackground,
  showFill = true,
  opacity = 1,
  fadeHorizontal = true,
  fadeVertical = true,
  fadeHorizontalLength = 10,
  fadeVerticalLength = 10,
}: BackgroundProps) {
  const { innerWidth, innerHeight, isLoaded, enterTransition } =
    useChartStable();
  const uniqueId = useId();
  const patternId = `chart-background-${uniqueId.replace(/:/g, '')}`;

  const hStops = useMemo(
    () => fadeMaskStops(fadeHorizontalLength),
    [fadeHorizontalLength]
  );
  const vStops = useMemo(
    () => fadeMaskStops(fadeVerticalLength),
    [fadeVerticalLength]
  );

  if (pattern === 'none' || !showFill || innerWidth <= 0 || innerHeight <= 0) {
    return null;
  }

  const patternNode = renderPatternPreset(pattern, patternId, {
    color,
    scale,
    strokeWidth,
    radius,
    complement,
    fill,
    dotFill,
    tileBackground,
  });
  if (!patternNode) {
    return null;
  }

  const fadeMask = fadeHorizontal || fadeVertical;
  const hMaskId = `chart-background-fade-h-${uniqueId.replace(/:/g, '')}`;
  const hGradientId = `${hMaskId}-gradient`;
  const vMaskId = `chart-background-fade-v-${uniqueId.replace(/:/g, '')}`;
  const vGradientId = `${vMaskId}-gradient`;
  const combinedMaskId = `chart-background-fade-${uniqueId.replace(/:/g, '')}`;

  let maskRef: string | undefined;
  if (fadeHorizontal && fadeVertical) {
    maskRef = `url(#${combinedMaskId})`;
  } else if (fadeHorizontal) {
    maskRef = `url(#${hMaskId})`;
  } else if (fadeVertical) {
    maskRef = `url(#${vMaskId})`;
  }

  const targetOpacity = opacity;
  const revealOpacity = isLoaded ? targetOpacity : 0;
  const enterFade =
    enterTransition && typeof enterTransition === 'object'
      ? enterTransition
      : { duration: BACKGROUND_ENTER_FADE_MS / 1000, ease: 'easeOut' as const };

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative plot-area pattern layer
    <g aria-hidden="true" className="chart-background">
      {fadeMask ? (
        <defs>
          {fadeHorizontal ? (
            <>
              <linearGradient
                id={hGradientId}
                x1="0%"
                x2="100%"
                y1="0%"
                y2="0%"
              >
                {hStops.map((stop) => (
                  <stop
                    key={stop.offset}
                    offset={stop.offset}
                    style={{ stopColor: 'white', stopOpacity: stop.opacity }}
                  />
                ))}
              </linearGradient>
              <mask id={hMaskId}>
                <rect
                  fill={`url(#${hGradientId})`}
                  height={innerHeight}
                  width={innerWidth}
                  x={0}
                  y={0}
                />
              </mask>
            </>
          ) : null}
          {fadeVertical ? (
            <>
              <linearGradient
                id={vGradientId}
                x1="0%"
                x2="0%"
                y1="0%"
                y2="100%"
              >
                {vStops.map((stop) => (
                  <stop
                    key={stop.offset}
                    offset={stop.offset}
                    style={{ stopColor: 'white', stopOpacity: stop.opacity }}
                  />
                ))}
              </linearGradient>
              <mask id={vMaskId}>
                <rect
                  fill={`url(#${vGradientId})`}
                  height={innerHeight}
                  width={innerWidth}
                  x={0}
                  y={0}
                />
              </mask>
            </>
          ) : null}
          {fadeHorizontal && fadeVertical ? (
            <mask id={combinedMaskId}>
              <g mask={`url(#${hMaskId})`}>
                <rect
                  fill={`url(#${vGradientId})`}
                  height={innerHeight}
                  width={innerWidth}
                  x={0}
                  y={0}
                />
              </g>
            </mask>
          ) : null}
        </defs>
      ) : null}
      <defs>{patternNode}</defs>
      <motion.rect
        animate={{ opacity: revealOpacity }}
        fill={`url(#${patternId})`}
        height={innerHeight}
        initial={{ opacity: 0 }}
        mask={maskRef}
        transition={isLoaded ? enterFade : { duration: 0 }}
        width={innerWidth}
        x={0}
        y={0}
      />
    </g>
  );
}

Background.displayName = 'Background';

export default Background;
