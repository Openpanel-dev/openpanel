import { isSameDay, isSameMonth } from 'date-fns';

export const NOT_SET_VALUE = '(not set)';

export const timeWindows = {
  '30min': {
    key: '30min',
    label: 'Last 30 min',
    shortcut: 'R',
  },
  lastHour: {
    key: 'lastHour',
    label: 'Last hour',
    shortcut: 'H',
  },
  today: {
    key: 'today',
    label: 'Today',
    shortcut: 'D',
  },
  '7d': {
    key: '7d',
    label: 'Last 7 days',
    shortcut: 'W',
  },
  '30d': {
    key: '30d',
    label: 'Last 30 days',
    shortcut: 'T',
  },
  monthToDate: {
    key: 'monthToDate',
    label: 'Month to Date',
    shortcut: 'M',
  },
  lastMonth: {
    key: 'lastMonth',
    label: 'Last Month',
    shortcut: 'P',
  },
  yearToDate: {
    key: 'yearToDate',
    label: 'Year to Date',
    shortcut: 'Y',
  },
  lastYear: {
    key: 'lastYear',
    label: 'Last year',
    shortcut: 'U',
  },
  custom: {
    key: 'custom',
    label: 'Custom range',
    shortcut: 'C',
  },
} as const;

export const ProjectTypeNames = {
  website: 'Website',
  app: 'App',
  backend: 'Backend',
} as const;

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
  funnel: 'Funnel',
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

export const deprecated_timeRanges = {
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

export function isMinuteIntervalEnabledByRange(
  range: keyof typeof timeWindows
) {
  return range === '30min' || range === 'lastHour';
}

export function isHourIntervalEnabledByRange(range: keyof typeof timeWindows) {
  return isMinuteIntervalEnabledByRange(range) || range === 'today';
}

export function getDefaultIntervalByRange(
  range: keyof typeof timeWindows
): keyof typeof intervals {
  if (range === '30min' || range === 'lastHour') {
    return 'minute';
  } else if (range === 'today') {
    return 'hour';
  } else if (
    range === '7d' ||
    range === '30d' ||
    range === 'lastMonth' ||
    range === 'monthToDate'
  ) {
    return 'day';
  }
  return 'month';
}

export function getDefaultIntervalByDates(
  startDate: string | null,
  endDate: string | null
): null | keyof typeof intervals {
  if (startDate && endDate) {
    if (isSameDay(startDate, endDate)) {
      return 'hour';
    } else if (isSameMonth(startDate, endDate)) {
      return 'day';
    }
    return 'month';
  }

  return null;
}
