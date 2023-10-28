export const operators = {
  is: "Is",
  isNot: "Is not",
  contains: "Contains",
  doesNotContain: "Not contains",
};

export const chartTypes = {
  linear: "Linear",
  bar: "Bar",
  pie: "Pie",
  metric: "Metric",
  area: "Area",
};

export const intervals = {
  day: "Day",
  hour: "Hour",
  month: "Month",
};

export const alphabetIds = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

export const timeRanges = {
  'today': 'Today',
  1: '24 hours',
  7: '7 days',
  14: '14 days',
  30: '30 days',
  90: '3 months',
  180: '6 months',
  365: '1 year',
}