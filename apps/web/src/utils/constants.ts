export const operators = {
  is: 'Is',
  isNot: 'Is not',
  contains: 'Contains',
  doesNotContain: 'Not contains',
} as const;

export const chartTypes = {
  linear: 'Linear',
  bar: 'Bar',
  histogram: 'Histogram',
  pie: 'Pie',
  metric: 'Metric',
  area: 'Area',
  map: 'Map',
} as const;

export const lineTypes = {
  monotone: 'Monotone',
  monotoneX: 'Monotone X',
  monotoneY: 'Monotone Y',
  linear: 'Linear',
  natural: 'Natural',
  basis: 'Basis',
  step: 'Step',
  stepBefore: 'Step before',
  stepAfter: 'Step after',
  basisClosed: 'Basis closed',
  basisOpen: 'Basis open',
  bumpX: 'Bump X',
  bumpY: 'Bump Y',
  bump: 'Bump',
  linearClosed: 'Linear closed',
} as const;

export const intervals = {
  minute: 'minute',
  day: 'day',
  hour: 'hour',
  month: 'month',
} as const;

export const alphabetIds = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
] as const;

export const timeRanges = {
  '30min': '30min',
  '1h': '1h',
  today: 'today',
  '24h': '24h',
  '7d': '7d',
  '14d': '14d',
  '1m': '1m',
  '3m': '3m',
  '6m': '6m',
  '1y': '1y',
} as const;

export const metrics = {
  sum: 'sum',
  average: 'average',
  min: 'min',
  max: 'max',
} as const;

export function isMinuteIntervalEnabledByRange(range: keyof typeof timeRanges) {
  return range === '30min' || range === '1h';
}

export function isHourIntervalEnabledByRange(range: keyof typeof timeRanges) {
  return (
    isMinuteIntervalEnabledByRange(range) ||
    range === 'today' ||
    range === '24h'
  );
}

export function getDefaultIntervalByRange(
  range: keyof typeof timeRanges
): keyof typeof intervals {
  if (range === '30min' || range === '1h') {
    return 'minute';
  } else if (range === 'today' || range === '24h') {
    return 'hour';
  } else if (range === '7d' || range === '14d' || range === '1m') {
    return 'day';
  }
  return 'month';
}
