import type { chartTypes, lineTypes } from '@openpanel/constants';

const chartTypeLabelKeys = {
  linear: 'reports.chart_type_linear',
  bar: 'reports.chart_type_bar',
  histogram: 'reports.chart_type_histogram',
  pie: 'reports.chart_type_pie',
  metric: 'reports.chart_type_metric',
  area: 'reports.chart_type_area',
  map: 'reports.chart_type_map',
  funnel: 'reports.chart_type_funnel',
  retention: 'reports.chart_type_retention',
  conversion: 'reports.chart_type_conversion',
  sankey: 'reports.chart_type_sankey',
} satisfies Record<keyof typeof chartTypes, string>;

const lineTypeLabelKeys = {
  monotone: 'reports.line_type_monotone',
  monotoneX: 'reports.line_type_monotone_x',
  monotoneY: 'reports.line_type_monotone_y',
  linear: 'reports.line_type_linear',
  natural: 'reports.line_type_natural',
  basis: 'reports.line_type_basis',
  step: 'reports.line_type_step',
  stepBefore: 'reports.line_type_step_before',
  stepAfter: 'reports.line_type_step_after',
  basisClosed: 'reports.line_type_basis_closed',
  basisOpen: 'reports.line_type_basis_open',
  bumpX: 'reports.line_type_bump_x',
  bumpY: 'reports.line_type_bump_y',
  bump: 'reports.line_type_bump',
  linearClosed: 'reports.line_type_linear_closed',
} satisfies Record<keyof typeof lineTypes, string>;

export function getChartTypeLabelKey(type: keyof typeof chartTypes): string {
  return chartTypeLabelKeys[type];
}

export function getLineTypeLabelKey(type: keyof typeof lineTypes): string {
  return lineTypeLabelKeys[type];
}
