export const operators = {
  is: 'Is',
  isNot: 'Is not',
  contains: 'Contains',
  doesNotContain: 'Not contains',
};

export const chartTypes = {
  linear: 'Linear',
  bar: 'Bar',
  histogram: 'Histogram',
  pie: 'Pie',
  metric: 'Metric',
  area: 'Area',
};

export const intervals = {
  minute: 'Minute',
  day: 'Day',
  hour: 'Hour',
  month: 'Month',
};

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

export function isMinuteIntervalEnabledByRange(range: keyof typeof timeRanges) {
  return range === '30min' || range === '1h';
}
