// `getDefaultIntervalByDates` is REWRITTEN from date-fns
// (differenceInDays/isSameDay) to plain Date math per the module map. Every
// process that constructs these Dates runs under TZ=UTC (ADR-012: "this ADR
// makes that line load-bearing rather than incidental"), so Date's local
// getters (getFullYear/getMonth/getDate) already read UTC — the helpers below
// reproduce date-fns's local-calendar semantics exactly under that invariant,
// and the only inputs this function ever receives are date-only strings
// (midnight boundaries), where date-fns's exact-duration-vs-calendar-day nuance
// cannot diverge from a plain ms division anyway.
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

import { z } from 'zod';

export const DEFAULT_ASPECT_RATIO = 0.5625;
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
  last24h: {
    key: 'last24h',
    label: 'Last 24 hours',
    shortcut: '4',
  },
  today: {
    key: 'today',
    label: 'Today',
    shortcut: 'D',
  },
  yesterday: {
    key: 'yesterday',
    label: 'Yesterday',
    shortcut: 'E',
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
  '3m': {
    key: '3m',
    label: 'Last 3 months',
    shortcut: '3',
  },
  '6m': {
    key: '6m',
    label: 'Last 6 months',
    shortcut: '6',
  },
  '12m': {
    key: '12m',
    label: 'Last 12 months',
    shortcut: '0',
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

export const operators = {
  is: 'Is',
  isNot: 'Is not',
  contains: 'Contains',
  doesNotContain: 'Not contains',
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  regex: 'Regex',
  isNull: 'Is null',
  isNotNull: 'Is not null',
  gt: 'Greater than',
  lt: 'Less than',
  gte: 'Greater than or equal to',
  lte: 'Less than or equal to',
  inCohort: 'In cohort',
  notInCohort: 'Not in cohort',
} as const;

// Compact labels for the operator trigger button. The comparison operators
// have very long names ("Greater than or equal to"), so we show a symbol on
// the trigger (reads naturally next to the value, e.g. "≥ 2019-01-01") and
// surface the full `operators` text as a sub-line in the dropdown.
export const operatorsShort: Record<keyof typeof operators, string> = {
  is: 'Is',
  isNot: 'Is not',
  contains: 'Contains',
  doesNotContain: 'Not contains',
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  regex: 'Regex',
  isNull: 'Is null',
  isNotNull: 'Is not null',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  inCohort: 'In cohort',
  notInCohort: 'Not in cohort',
};

// Cast type a filter value/column should be coerced to before comparing.
// `string` (the default) keeps raw text comparison; the others wrap both sides
// of the comparison in the matching ClickHouse cast (see packages/db
// filter-cast.ts) so e.g. a date property compares as a date instead of
// crashing `toFloat64('2019-01-01')`.
export const filterValueTypes = {
  string: 'Text',
  number: 'Number',
  date: 'Date',
  datetime: 'Date & time',
  boolean: 'Boolean',
} as const;

export type IFilterValueType = keyof typeof filterValueTypes;

// Operators that make sense for each value type. The type constrains the
// operator list in the UI (a Number can't `contains`, a Boolean only
// `is`/`isNot`). Cohort operators are excluded everywhere — they're surfaced by
// CohortFilterItem, not the standard operator select.
const STRING_OPERATORS = [
  'is',
  'isNot',
  'contains',
  'doesNotContain',
  'startsWith',
  'endsWith',
  'regex',
  'isNull',
  'isNotNull',
] as const;

const ORDERED_OPERATORS = [
  'is',
  'isNot',
  'gt',
  'gte',
  'lt',
  'lte',
  'isNull',
  'isNotNull',
] as const;

const BOOLEAN_OPERATORS = ['is', 'isNot', 'isNull', 'isNotNull'] as const;

export function getOperatorsForType(
  type?: IFilterValueType
): readonly (keyof typeof operators)[] {
  switch (type) {
    case 'number':
    case 'date':
    case 'datetime':
      return ORDERED_OPERATORS;
    case 'boolean':
      return BOOLEAN_OPERATORS;
    default:
      return STRING_OPERATORS;
  }
}

export const chartTypes = {
  linear: 'Linear',
  bar: 'Bar',
  histogram: 'Histogram',
  pie: 'Pie',
  metric: 'Metric',
  area: 'Area',
  map: 'Map',
  funnel: 'Funnel',
  retention: 'Retention',
  conversion: 'Conversion',
  sankey: 'Sankey',
} as const;

export const chartSegments = {
  event: 'All events',
  user: 'Unique users',
  session: 'Unique sessions',
  group: 'Unique groups',
  user_average: 'Average users',
  one_event_per_user: 'One event per user',
  property_sum: 'Sum of property',
  property_average: 'Average of property',
  property_max: 'Max of property',
  property_min: 'Min of property',
};

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
  week: 'week',
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
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

export const metrics = {
  count: 'count',
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
  return (
    isMinuteIntervalEnabledByRange(range) ||
    range === 'today' ||
    range === 'yesterday' ||
    range === 'last24h' ||
    range === '7d'
  );
}

export function getDefaultIntervalByRange(
  range: keyof typeof timeWindows
): keyof typeof intervals {
  if (range === '30min' || range === 'lastHour') {
    return 'minute';
  }
  if (range === 'today' || range === 'yesterday' || range === 'last24h') {
    return 'hour';
  }
  if (
    range === '7d' ||
    range === '30d' ||
    range === '3m' ||
    range === 'lastMonth' ||
    range === 'monthToDate'
  ) {
    return 'day';
  }
  if (range === '6m') {
    return 'week';
  }
  return 'month';
}

const MS_PER_DAY = 86_400_000;

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** date-fns's differenceInDays without the dependency — see file header. */
function differenceInDays(dateLeft: Date, dateRight: Date): number {
  return Math.trunc((dateLeft.getTime() - dateRight.getTime()) / MS_PER_DAY);
}

export function getDefaultIntervalByDates(
  startDate: string | null,
  endDate: string | null
): null | keyof typeof intervals {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isSameCalendarDay(start, end)) {
      return 'hour';
    }
    const days = differenceInDays(end, start);
    if (days <= 92) {
      return 'day';
    }
    if (days <= 186) {
      return 'week';
    }
    return 'month';
  }

  return null;
}

export const countries = {
  AF: 'Afghanistan',
  AL: 'Albania',
  DZ: 'Algeria',
  AS: 'American Samoa',
  AD: 'Andorra',
  AO: 'Angola',
  AI: 'Anguilla',
  AQ: 'Antarctica',
  AG: 'Antigua and Barbuda',
  AR: 'Argentina',
  AM: 'Armenia',
  AW: 'Aruba',
  AU: 'Australia',
  AT: 'Austria',
  AZ: 'Azerbaijan',
  BS: 'Bahamas',
  BH: 'Bahrain',
  BD: 'Bangladesh',
  BB: 'Barbados',
  BY: 'Belarus',
  BE: 'Belgium',
  BZ: 'Belize',
  BJ: 'Benin',
  BM: 'Bermuda',
  BT: 'Bhutan',
  BO: 'Bolivia',
  BQ: 'Bonaire, Sint Eustatius and Saba',
  BA: 'Bosnia and Herzegovina',
  BW: 'Botswana',
  BV: 'Bouvet Island',
  BR: 'Brazil',
  IO: 'British Indian Ocean Territory',
  BN: 'Brunei Darussalam',
  BG: 'Bulgaria',
  BF: 'Burkina Faso',
  BI: 'Burundi',
  CV: 'Cabo Verde',
  KH: 'Cambodia',
  CM: 'Cameroon',
  CA: 'Canada',
  KY: 'Cayman Islands',
  CF: 'Central African Republic',
  TD: 'Chad',
  CL: 'Chile',
  CN: 'China',
  CX: 'Christmas Island',
  CC: 'Cocos (Keeling) Islands',
  CO: 'Colombia',
  KM: 'Comoros',
  CD: 'Congo (Democratic Republic)',
  CG: 'Congo',
  CK: 'Cook Islands',
  CR: 'Costa Rica',
  HR: 'Croatia',
  CU: 'Cuba',
  CW: 'Curaçao',
  CY: 'Cyprus',
  CZ: 'Czechia',
  CI: "Côte d'Ivoire",
  DK: 'Denmark',
  DJ: 'Djibouti',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  EC: 'Ecuador',
  EG: 'Egypt',
  SV: 'El Salvador',
  GQ: 'Equatorial Guinea',
  ER: 'Eritrea',
  EE: 'Estonia',
  SZ: 'Eswatina',
  ET: 'Ethiopia',
  FK: 'Falkland Islands',
  FO: 'Faroe Islands',
  FJ: 'Fiji',
  FI: 'Finland',
  FR: 'France',
  GF: 'French Guiana',
  PF: 'French Polynesia',
  TF: 'French Southern Territories',
  GA: 'Gabon',
  GM: 'Gambia',
  GE: 'Georgia',
  DE: 'Germany',
  GH: 'Ghana',
  GI: 'Gibraltar',
  GR: 'Greece',
  GL: 'Greenland',
  GD: 'Grenada',
  GP: 'Guadeloupe',
  GU: 'Guam',
  GT: 'Guatemala',
  GG: 'Guernsey',
  GN: 'Guinea',
  GW: 'Guinea-Bissau',
  GY: 'Guyana',
  HT: 'Haiti',
  HM: 'Heard Island and McDonald Islands',
  VA: 'Holy See',
  HN: 'Honduras',
  HK: 'Hong Kong',
  HU: 'Hungary',
  IS: 'Iceland',
  IN: 'India',
  ID: 'Indonesia',
  IR: 'Iran',
  IQ: 'Iraq',
  IE: 'Ireland',
  IM: 'Isle of Man',
  IL: 'Israel',
  IT: 'Italy',
  JM: 'Jamaica',
  JP: 'Japan',
  JE: 'Jersey',
  JO: 'Jordan',
  KZ: 'Kazakhstan',
  KE: 'Kenya',
  KI: 'Kiribati',
  KP: "Korea (Democratic People's Republic)",
  KR: 'Korea (Republic)',
  KW: 'Kuwait',
  KG: 'Kyrgyzstan',
  LA: "Lao People's Democratic Republic",
  LV: 'Latvia',
  LB: 'Lebanon',
  LS: 'Lesotho',
  LR: 'Liberia',
  LY: 'Libya',
  LI: 'Liechtenstein',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MO: 'Macao',
  MG: 'Madagascar',
  MW: 'Malawi',
  MY: 'Malaysia',
  MV: 'Maldives',
  ML: 'Mali',
  MT: 'Malta',
  MH: 'Marshall Islands',
  MQ: 'Martinique',
  MR: 'Mauritania',
  MU: 'Mauritius',
  YT: 'Mayotte',
  MX: 'Mexico',
  FM: 'Micronesia',
  MD: 'Moldova',
  MC: 'Monaco',
  MN: 'Mongolia',
  ME: 'Montenegro',
  MS: 'Montserrat',
  MA: 'Morocco',
  MZ: 'Mozambique',
  MM: 'Myanmar',
  NA: 'Namibia',
  NR: 'Nauru',
  NP: 'Nepal',
  NL: 'Netherlands',
  NC: 'New Caledonia',
  NZ: 'New Zealand',
  NI: 'Nicaragua',
  NE: 'Niger',
  NG: 'Nigeria',
  NU: 'Niue',
  NF: 'Norfolk Island',
  MP: 'Northern Mariana Islands',
  NO: 'Norway',
  OM: 'Oman',
  PK: 'Pakistan',
  PW: 'Palau',
  PS: 'Palestine, State of',
  PA: 'Panama',
  PG: 'Papua New Guinea',
  PY: 'Paraguay',
  PE: 'Peru',
  PH: 'Philippines',
  PN: 'Pitcairn',
  PL: 'Poland',
  PT: 'Portugal',
  PR: 'Puerto Rico',
  QA: 'Qatar',
  MK: 'Republic of North Macedonia',
  RO: 'Romania',
  RU: 'Russian Federation',
  RW: 'Rwanda',
  RE: 'Réunion',
  BL: 'Saint Barthélemy',
  SH: 'Saint Helena, Ascension and Tristan da Cunha',
  KN: 'Saint Kitts and Nevis',
  LC: 'Saint Lucia',
  MF: 'Saint Martin (French part)',
  PM: 'Saint Pierre and Miquelon',
  VC: 'Saint Vincent and the Grenadines',
  WS: 'Samoa',
  SM: 'San Marino',
  ST: 'Sao Tome and Principe',
  SA: 'Saudi Arabia',
  SN: 'Senegal',
  RS: 'Serbia',
  SC: 'Seychelles',
  SL: 'Sierra Leone',
  SG: 'Singapore',
  SX: 'Sint Maarten (Dutch part)',
  SK: 'Slovakia',
  SI: 'Slovenia',
  SB: 'Solomon Islands',
  SO: 'Somalia',
  ZA: 'South Africa',
  GS: 'South Georgia and the South Sandwich Islands',
  SS: 'South Sudan',
  ES: 'Spain',
  LK: 'Sri Lanka',
  SD: 'Sudan',
  SR: 'Suriname',
  SJ: 'Svalbard and Jan Mayen',
  SE: 'Sweden',
  CH: 'Switzerland',
  SY: 'Syrian Arab Republic',
  TW: 'Taiwan',
  TJ: 'Tajikistan',
  TZ: 'Tanzania, United Republic of',
  TH: 'Thailand',
  TL: 'Timor-Leste',
  TG: 'Togo',
  TK: 'Tokelau',
  TO: 'Tonga',
  TT: 'Trinidad and Tobago',
  TN: 'Tunisia',
  TR: 'Turkey',
  TM: 'Turkmenistan',
  TC: 'Turks and Caicos Islands',
  TV: 'Tuvalu',
  UG: 'Uganda',
  UA: 'Ukraine',
  AE: 'United Arab Emirates',
  GB: 'United Kingdom',
  US: 'United States',
  UM: 'United States Minor Outlying Islands',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VU: 'Vanuatu',
  VE: 'Venezuela',
  VN: 'Viet Nam',
  VG: 'Virgin Islands (British)',
  VI: 'Virgin Islands (U.S.)',
  WF: 'Wallis and Futuna',
  EH: 'Western Sahara',
  YE: 'Yemen',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
  AX: 'Åland Islands',
} as const;

export function getCountry(code?: string) {
  return countries[code as keyof typeof countries];
}

export const chartColors = [
  { main: '#2563EB', translucent: 'rgba(37, 99, 235, 0.1)' },
  { main: '#ff7557', translucent: 'rgba(255, 117, 87, 0.1)' },
  { main: '#7fe1d8', translucent: 'rgba(127, 225, 216, 0.1)' },
  { main: '#f8bc3c', translucent: 'rgba(248, 188, 60, 0.1)' },
  { main: '#b3596e', translucent: 'rgba(179, 89, 110, 0.1)' },
  { main: '#72bef4', translucent: 'rgba(114, 190, 244, 0.1)' },
  { main: '#ffb27a', translucent: 'rgba(255, 178, 122, 0.1)' },
  { main: '#0f7ea0', translucent: 'rgba(15, 126, 160, 0.1)' },
  { main: '#3ba974', translucent: 'rgba(59, 169, 116, 0.1)' },
  { main: '#febbb2', translucent: 'rgba(254, 187, 178, 0.1)' },
  { main: '#cb80dc', translucent: 'rgba(203, 128, 220, 0.1)' },
  { main: '#5cb7af', translucent: 'rgba(92, 183, 175, 0.1)' },
  { main: '#7856ff', translucent: 'rgba(120, 86, 255, 0.1)' },
];

/**
 * Chart formulas are plain arithmetic over series references (A, B, C, ...).
 * The API validates the parsed expression tree as well; this charset guard
 * rejects the obviously hostile shapes (assignment, indexing, object/array
 * literals, statement separators) at the edge, in the browser and on the API.
 */
const CHART_FORMULA_PATTERN = /^[A-Za-z0-9_ .,+\-*/()%^]*$/;

// Helper, not vocabulary — ADR-008 rules this the one genuine exception to the
// module-export rule: every consumer copies these 4 lines locally instead of
// importing them (apps/start/src/utils/object-to-zod-enums.ts is the frontend's
// copy). Kept private here for report.constants.ts's own use building the enums
// below.
function objectToZodEnums<K extends string>(
  obj: Record<K, unknown>
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const zChartEventFilter = z.object({
  id: z.string().optional().describe('Unique identifier for the filter'),
  name: z.string().describe('The property name to filter on'),
  operator: z
    .enum(objectToZodEnums(operators))
    .describe('The operator to use for the filter'),
  value: z
    .array(z.string().or(z.number()).or(z.boolean()).or(z.null()))
    .describe('The values to filter on'),
  type: z
    .enum(objectToZodEnums(filterValueTypes))
    .optional()
    .describe(
      'Cast type for the column/value in equality & comparison operators ' +
        '(string/number/date/datetime/boolean). Absent = legacy behavior.'
    ),
  cohortId: z
    .string()
    .optional()
    .describe(
      'DEPRECATED: legacy single-cohort id, kept for saved reports. ' +
        'New code reads cohortIds via getCohortIds(filter).'
    ),
  cohortIds: z
    .array(z.string())
    .optional()
    .describe(
      'Cohort IDs for inCohort/notInCohort. Multiple ids OR-match ' +
        '(matches profiles in any of the listed cohorts).'
    ),
});

/**
 * Normalize the two cohort id fields on a filter into a single array.
 *
 * Both `cohortIds` (new, multi-value) and `cohortId` (legacy, single-value)
 * coexist on `zChartEventFilter` for backward compatibility with saved
 * reports. Always read cohort membership through this helper instead of
 * accessing the raw fields, so legacy data keeps working.
 */
export function getCohortIds(filter: {
  cohortIds?: string[];
  cohortId?: string;
}): string[] {
  if (filter.cohortIds && filter.cohortIds.length > 0) {
    return filter.cohortIds;
  }
  if (filter.cohortId) {
    return [filter.cohortId];
  }
  return [];
}

export const zChartEventSegment = z
  .enum(objectToZodEnums(chartSegments))
  .default('event')
  .describe('Defines how the event data should be segmented or aggregated');

export const zChartEvent = z.object({
  id: z
    .string()
    .optional()
    .describe('Unique identifier for the chart event configuration'),
  name: z.string().describe('The name of the event as tracked in the system'),
  displayName: z
    .string()
    .optional()
    .describe('A user-friendly name for display purposes'),
  property: z
    .string()
    .optional()
    .describe(
      'Optional property of the event used for specific segment calculations (e.g., value for property_sum/average)'
    ),
  segment: zChartEventSegment,
  filters: z
    .array(zChartEventFilter)
    .default([])
    .describe('Filters applied specifically to this event'),
});

export const zChartFormula = z.object({
  id: z
    .string()
    .optional()
    .describe('Unique identifier for the formula configuration'),
  type: z.literal('formula'),
  formula: z
    .string()
    .max(1000)
    .regex(
      CHART_FORMULA_PATTERN,
      'Formula may only contain series references, numbers and arithmetic operators'
    )
    .describe('The formula expression (e.g., A+B, A/B)'),
  displayName: z
    .string()
    .optional()
    .describe('A user-friendly name for display purposes'),
  hideSeries: z
    .array(z.string())
    .optional()
    .describe(
      'Alpha IDs (e.g. ["A", "B"]) of series referenced by this formula that should be hidden from the chart while still being used in the formula computation'
    ),
});

// Event with type field for discriminated union
export const zChartEventWithType = zChartEvent.extend({
  type: z.literal('event'),
});

export const zChartEventItem = z.discriminatedUnion('type', [
  zChartEventWithType,
  zChartFormula,
]);

export const zChartBreakdown = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export const zChartSeries = z
  .array(zChartEventItem)
  .describe(
    'Array of series (events or formulas) to be tracked and displayed in the chart'
  );

export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(objectToZodEnums(chartTypes));

export const zLineType = z.enum(objectToZodEnums(lineTypes));

export const zTimeInterval = z.enum(objectToZodEnums(intervals));

export const zMetric = z.enum(objectToZodEnums(metrics));

export const zRange = z.enum(objectToZodEnums(timeWindows));

export const zCriteria = z.enum(['on_or_after', 'on']);

// Report Options - Discriminated union based on chart type
export const zFunnelOptions = z.object({
  type: z.literal('funnel'),
  funnelGroup: z.string().optional(),
  funnelWindow: z.number().optional(),
});

export const zRetentionOptions = z.object({
  type: z.literal('retention'),
  criteria: zCriteria.optional(),
});

export const zSankeyOptions = z.object({
  type: z.literal('sankey'),
  mode: z.enum(['between', 'after', 'before']),
  steps: z.number().min(2).max(10).default(5),
  exclude: z.array(z.string()).default([]),
  include: z.array(z.string()).optional(),
});

export const zHistogramOptions = z.object({
  type: z.literal('histogram'),
  stacked: z.boolean().default(false),
});

export const zReportOptions = z.discriminatedUnion('type', [
  zFunnelOptions,
  zRetentionOptions,
  zSankeyOptions,
  zHistogramOptions,
]);

export type IReportOptions = z.infer<typeof zReportOptions>;
export type ISankeyOptions = z.infer<typeof zSankeyOptions>;
export type IHistogramOptions = z.infer<typeof zHistogramOptions>;

export const zWidgetType = z.enum(['realtime', 'counter']);
export type IWidgetType = z.infer<typeof zWidgetType>;

export const zRealtimeWidgetOptions = z.object({
  type: z.literal('realtime'),
  referrers: z.boolean().default(true),
  countries: z.boolean().default(true),
  paths: z.boolean().default(false),
});

export const zCounterWidgetOptions = z.object({
  type: z.literal('counter'),
});

export const zWidgetOptions = z.discriminatedUnion('type', [
  zRealtimeWidgetOptions,
  zCounterWidgetOptions,
]);

export type IWidgetOptions = z.infer<typeof zWidgetOptions>;
export type ICounterWidgetOptions = z.infer<typeof zCounterWidgetOptions>;
export type IRealtimeWidgetOptions = z.infer<typeof zRealtimeWidgetOptions>;

// Base input schema - for API calls, engine, chart queries
export const zReportInput = z.object({
  projectId: z.string().describe('The ID of the project this chart belongs to'),
  chartType: zChartType
    .default('linear')
    .describe('What type of chart should be displayed'),
  interval: zTimeInterval
    .default('day')
    .describe(
      'The time interval for data aggregation (e.g., day, week, month)'
    ),
  series: zChartSeries.describe(
    'Array of series (events or formulas) to be tracked and displayed in the chart'
  ),
  breakdowns: zChartBreakdowns
    .default([])
    .describe('Array of dimensions to break down the data by'),
  globalFilters: z
    .array(zChartEventFilter)
    .optional()
    .describe(
      'Filters applied to ALL event series in this report (combined with each series own filters using AND)'
    ),
  range: zRange
    .default('30d')
    .describe('The time range for which data should be displayed'),
  startDate: z
    .string()
    .nullish()
    .describe(
      'Custom start date for the data range (overrides range if provided)'
    ),
  endDate: z
    .string()
    .nullish()
    .describe(
      'Custom end date for the data range (overrides range if provided)'
    ),
  previous: z
    .boolean()
    .default(false)
    .describe('Whether to show data from the previous period for comparison'),
  formula: z
    .string()
    .optional()
    .describe('Custom formula for calculating derived metrics'),
  metric: zMetric
    .default('sum')
    .describe(
      'The aggregation method for the metric (e.g., sum, count, average)'
    ),
  limit: z
    .number()
    .optional()
    .describe('Limit how many series should be returned'),
  offset: z
    .number()
    .optional()
    .describe('Skip how many series should be returned'),
  visibleSeries: z
    .array(z.string())
    .nullish()
    .describe('IDs of series that should be visible on the chart'),
  options: zReportOptions
    .optional()
    .describe('Chart-specific options (funnel, retention, sankey)'),
  // Optional display fields
  name: z.string().optional().describe('The user-defined name for the report'),
  lineType: zLineType
    .optional()
    .describe('The visual style of the line in the chart'),
  unit: z
    .string()
    .optional()
    .describe(
      "Optional unit of measurement for the chart's Y-axis (e.g., $, %, users)"
    ),
});

// Complete report schema - for saved reports
export const zReport = zReportInput.extend({
  name: z
    .string()
    .default('Untitled')
    .describe('The user-defined name for the report'),
  lineType: zLineType
    .default('monotone')
    .describe('The visual style of the line in the chart'),
});

// Alias for backward compatibility
export const zChartInput = zReportInput;

// --------------------------------------------------------------------------
// Inferred report/chart types, moved from
// packages/validation/src/types.validation.ts (ADR-008's module map: report
// owns "C" for the chart/report/widget vocabulary). They land beside the
// schemas they infer from, which is what removes that file's `import type { … }
// from './index'` back-edge. `IChartEvents` and `ISetCookie` do NOT come along:
// the first is a dead alias with no importers, the second is
// already../../shared/cookie.ts. `UnionOmit` has no owning module — it is kept
// here, with the report types it is only ever applied to (apps/start's
// reportSlice), until M11-007 gives apps/start its own copy.
// ---------------------------------------------------------------------------

export type UnionOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

// For saved reports - complete report with required display fields
export type IReport = z.infer<typeof zReport>;

// For API/engine use - flexible input
export type IReportInput = z.infer<typeof zReportInput>;

// With resolved dates (engine internal)
export interface IReportInputWithDates extends IReportInput {
  startDate: string;
  endDate: string;
}
export type IChartEvent = z.infer<typeof zChartEvent>;
export type IChartFormula = z.infer<typeof zChartFormula>;
export type IChartEventItem = z.infer<typeof zChartEventItem>;
export type IChartSeries = z.infer<typeof zChartSeries>;
export type IChartEventSegment = z.infer<typeof zChartEventSegment>;
export type IChartEventFilter = IChartEvent['filters'][number];
export type IChartEventFilterValue =
  IChartEvent['filters'][number]['value'][number];
export type IChartEventFilterOperator =
  IChartEvent['filters'][number]['operator'];
export type IChartFilterValueType = NonNullable<
  IChartEvent['filters'][number]['type']
>;
export type IChartBreakdown = z.infer<typeof zChartBreakdown>;
export type IInterval = z.infer<typeof zTimeInterval>;
export type IChartType = z.infer<typeof zChartType>;
export type IChartMetric = z.infer<typeof zMetric>;
export type IChartLineType = z.infer<typeof zLineType>;
export type IChartRange = z.infer<typeof zRange>;
export type IGetChartDataInput = {
  event: IChartEvent;
  projectId: string;
  startDate: string;
  endDate: string;
} & Omit<
  IReportInput,
  'series' | 'globalFilters' | 'startDate' | 'endDate' | 'range'
>;
export type ICriteria = z.infer<typeof zCriteria>;

export type PreviousValue =
  | {
      value: number;
      diff: number | null;
      state: 'positive' | 'negative' | 'neutral';
    }
  | undefined;

export type Metrics = {
  sum: number;
  average: number;
  min: number;
  max: number;
  count: number | undefined;
  previous?: {
    sum: PreviousValue;
    average: PreviousValue;
    min: PreviousValue;
    max: PreviousValue;
    count: PreviousValue;
  };
};

export type IChartSerie = {
  id: string;
  names: string[];
  event: {
    id?: string;
    name: string;
    breakdowns?: Record<string, string>;
  };
  metrics: Metrics;
  data: {
    date: string;
    count: number;
    /**
     * Absent, not `undefined`, when the request asked for no previous period.
     * superjson writes one metadata entry per explicit `undefined`, and a long
     * range with breakdowns produced millions of them; over the wire the two
     * are indistinguishable. Read it as optional.
     */
    previous?: PreviousValue;
  }[];
};

export type FinalChart = {
  series: IChartSerie[];
  metrics: Metrics;
};
