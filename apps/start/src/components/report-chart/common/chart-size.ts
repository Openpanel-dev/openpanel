import { useReportChartContext } from '../context';

export type ChartSizeTier = 'compact' | 'medium' | 'wide';

const COMPACT_MAX_WIDTH = 320;
const MEDIUM_MAX_WIDTH = 640;

const X_AXIS_TICKS = {
  compact: 3,
  medium: 4,
  wide: 5,
} satisfies Record<ChartSizeTier, number>;

const LEGEND_LIMIT = {
  compact: 0,
  medium: 3,
  wide: Number.POSITIVE_INFINITY,
} satisfies Record<ChartSizeTier, number>;

const EDGE_MARGIN = 12;
const Y_AXIS_WIDTH = 40;
const X_AXIS_HEIGHT = 28;

export function getSizeTier(width: number): ChartSizeTier {
  if (width < COMPACT_MAX_WIDTH) {
    return 'compact';
  }
  if (width < MEDIUM_MAX_WIDTH) {
    return 'medium';
  }
  return 'wide';
}

/** The axes, ticks and legend entries a chart has room for at its size. */
export function useChartChrome() {
  const {
    sizeTier,
    options: { hideXAxis, hideYAxis, hideLegend },
  } = useReportChartContext();
  // A compact tile spends its width on the data, not on Y labels.
  const showYAxis = !hideYAxis && sizeTier !== 'compact';
  const showXAxis = !hideXAxis;

  return {
    showXAxis,
    showYAxis,
    xAxisTicks: X_AXIS_TICKS[sizeTier],
    legendLimit: hideLegend ? 0 : LEGEND_LIMIT[sizeTier],
    margin: {
      top: EDGE_MARGIN,
      right: EDGE_MARGIN,
      bottom: showXAxis ? X_AXIS_HEIGHT : EDGE_MARGIN,
      left: showYAxis ? Y_AXIS_WIDTH : EDGE_MARGIN,
    },
  };
}
