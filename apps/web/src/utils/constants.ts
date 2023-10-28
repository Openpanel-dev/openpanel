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
  { range: 0, title: "Today" },
  { range: 1, title: "24 hours" },
  { range: 7, title: "7 days" },
  { range: 14, title: "14 days" },
  { range: 30, title: "30 days" },
  { range: 90, title: "3 months" },
  { range: 180, title: "6 months" },
  { range: 365, title: "1 year" },
] as const
