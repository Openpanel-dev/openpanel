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
  minute: "Minute",
  day: "Day",
  hour: "Hour",
  month: "Month",
};

export const alphabetIds = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
] as const;

export const timeRanges = [
  { range: 0.3, title: "30m" },
  { range: 0.6, title: "1h" },
  { range: 0, title: "Today" },
  { range: 1, title: "24h" },
  { range: 7, title: "7d" },
  { range: 14, title: "14d" },
  { range: 30, title: "30d" },
  { range: 90, title: "3mo" },
  { range: 180, title: "6mo" },
  { range: 365, title: "1y" },
] as const;
