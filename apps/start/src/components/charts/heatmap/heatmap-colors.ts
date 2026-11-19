import { CHART_SCALE_VARS } from '../chart-scale';
import type { PatternPresetId } from '../pattern-preset';
import { getHeatmapContributionLevel } from './heatmap-utils';

/** Default Less → More scale using {@link CHART_SCALE_VARS}. */
export const HEATMAP_DEFAULT_LEVEL_COLORS = CHART_SCALE_VARS;

export type HeatmapLevelColors = readonly [
  string,
  string,
  string,
  string,
  string,
];

export type HeatmapLevelFillMode = 'solid' | 'pattern';

export interface HeatmapLevelStyle {
  color: string;
  fillMode?: HeatmapLevelFillMode;
  pattern?: PatternPresetId;
  patternColor?: string;
  patternScale?: number;
  patternStrokeWidth?: number;
  patternRadius?: number;
  patternComplement?: boolean;
  patternFill?: string;
  patternTileBackground?: string;
  patternOpacity?: number;
  patternDotsFill?: boolean;
}

export type HeatmapLevelStyles = readonly [
  HeatmapLevelStyle,
  HeatmapLevelStyle,
  HeatmapLevelStyle,
  HeatmapLevelStyle,
  HeatmapLevelStyle,
];

export const HEATMAP_DEFAULT_LEVEL_STYLES = [
  {
    color: HEATMAP_DEFAULT_LEVEL_COLORS[0],
    fillMode: 'solid',
    pattern: 'none',
  },
  {
    color: HEATMAP_DEFAULT_LEVEL_COLORS[1],
    fillMode: 'solid',
    pattern: 'none',
  },
  {
    color: HEATMAP_DEFAULT_LEVEL_COLORS[2],
    fillMode: 'solid',
    pattern: 'none',
  },
  {
    color: HEATMAP_DEFAULT_LEVEL_COLORS[3],
    fillMode: 'solid',
    pattern: 'none',
  },
  {
    color: HEATMAP_DEFAULT_LEVEL_COLORS[4],
    fillMode: 'solid',
    pattern: 'none',
  },
] as const satisfies HeatmapLevelStyles;

export function heatmapLevelPatternId(level: number): string {
  return `heatmap-level-${level}`;
}

export function isHeatmapLevelPattern(style: HeatmapLevelStyle): boolean {
  return (
    style.fillMode === 'pattern' &&
    style.pattern != null &&
    style.pattern !== 'none'
  );
}

export function heatmapPatternStrokeFallback(color: string): string {
  return `color-mix(in oklch, ${color} 45%, white)`;
}

export function heatmapLevelPatternRenderOptions(style: HeatmapLevelStyle) {
  const preset = style.pattern ?? 'diagonal';
  let defaultScale = 1;
  if (preset === 'cross') {
    defaultScale = 1.33;
  }

  return {
    color:
      style.patternColor?.trim() ||
      (preset === 'accent'
        ? '#e879f9'
        : heatmapPatternStrokeFallback(style.color)),
    tileBackground: style.patternTileBackground?.trim() || style.color,
    scale: style.patternScale ?? defaultScale,
    strokeWidth: style.patternStrokeWidth,
    radius: style.patternRadius,
    complement: style.patternComplement,
    fill: style.patternFill?.trim() || undefined,
    dotFill: style.patternDotsFill,
  };
}

export function heatmapLevelCellFillOpacity(style: HeatmapLevelStyle): number {
  if (!isHeatmapLevelPattern(style)) {
    return 1;
  }
  return style.patternOpacity ?? 1;
}

export function levelColorsFromStyles(
  levelStyles: HeatmapLevelStyles
): HeatmapLevelColors {
  return [
    levelStyles[0].color,
    levelStyles[1].color,
    levelStyles[2].color,
    levelStyles[3].color,
    levelStyles[4].color,
  ];
}

export function levelStylesFromColors(
  levelColors: HeatmapLevelColors
): HeatmapLevelStyles {
  return [
    { color: levelColors[0], fillMode: 'solid', pattern: 'none' },
    { color: levelColors[1], fillMode: 'solid', pattern: 'none' },
    { color: levelColors[2], fillMode: 'solid', pattern: 'none' },
    { color: levelColors[3], fillMode: 'solid', pattern: 'none' },
    { color: levelColors[4], fillMode: 'solid', pattern: 'none' },
  ];
}

export function resolveHeatmapLevelStyles(
  levelColors?: HeatmapLevelColors,
  levelStyles?: HeatmapLevelStyles
): HeatmapLevelStyles {
  if (levelStyles) {
    return levelStyles;
  }
  if (levelColors) {
    return levelStylesFromColors(levelColors);
  }
  return HEATMAP_DEFAULT_LEVEL_STYLES;
}

export function buildHeatmapColorScale(
  levelColors: HeatmapLevelColors
): (count: number | null | undefined) => string {
  return buildHeatmapColorScaleFromStyles(levelStylesFromColors(levelColors));
}

export function buildHeatmapColorScaleFromStyles(
  levelStyles: HeatmapLevelStyles
): (count: number | null | undefined) => string {
  return (count: number | null | undefined) => {
    const level = getHeatmapContributionLevel(count ?? 0);
    return levelStyles[level]?.color ?? levelStyles[0].color;
  };
}

export function buildHeatmapFillScale(
  levelStyles: HeatmapLevelStyles
): (count: number | null | undefined) => string {
  return (count: number | null | undefined) => {
    const level = getHeatmapContributionLevel(count ?? 0);
    const style = levelStyles[level] ?? levelStyles[0];

    if (isHeatmapLevelPattern(style)) {
      return `url(#${heatmapLevelPatternId(level)})`;
    }

    return style.color;
  };
}

export const defaultHeatmapColorScale = buildHeatmapColorScale(
  HEATMAP_DEFAULT_LEVEL_COLORS
);

export const defaultHeatmapFillScale = buildHeatmapFillScale(
  HEATMAP_DEFAULT_LEVEL_STYLES
);
