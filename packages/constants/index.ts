import { differenceInDays, isSameDay, isSameMonth } from 'date-fns';

export const DEFAULT_ASPECT_RATIO = 0.5625;
export const NOT_SET_VALUE = '(not set)';

export const RESERVED_EVENT_NAMES = ['session_start', 'session_end'] as const;

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
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  regex: 'Regex',
  isNull: 'Is null',
  isNotNull: 'Is not null',
  gt: 'Greater than',
  lt: 'Less than',
  gte: 'Greater than or equal to',
  lte: 'Less than or equal to',
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
  retention: 'Retention',
  conversion: 'Conversion',
  sankey: 'Sankey',
} as const;

export const chartSegments = {
  event: 'All events',
  user: 'Unique users',
  session: 'Unique sessions',
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

export const deprecated_timeRanges = {
  '1h': '1h',
  '24h': '24h',
  '14d': '14d',
  '1m': '1m',
  '3m': '3m',
  '6m': '6m',
  '1y': '1y',
};

export const metrics = {
  count: 'count',
  sum: 'sum',
  average: 'average',
  min: 'min',
  max: 'max',
} as const;

export function isMinuteIntervalEnabledByRange(
  range: keyof typeof timeWindows,
) {
  return range === '30min' || range === 'lastHour';
}

export function isHourIntervalEnabledByRange(range: keyof typeof timeWindows) {
  return (
    isMinuteIntervalEnabledByRange(range) ||
    range === 'today' ||
    range === 'yesterday' ||
    range === '7d'
  );
}

export function getDefaultIntervalByRange(
  range: keyof typeof timeWindows,
): keyof typeof intervals {
  if (range === '30min' || range === 'lastHour') {
    return 'minute';
  }
  if (range === 'today' || range === 'yesterday') {
    return 'hour';
  }
  if (
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
  endDate: string | null,
): null | keyof typeof intervals {
  if (startDate && endDate) {
    if (isSameDay(startDate, endDate)) {
      return 'hour';
    }
    if (isSameMonth(startDate, endDate)) {
      return 'day';
    }
    if (differenceInDays(endDate, startDate) <= 31) {
      return 'day';
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

export const emailCategories = {
  onboarding: 'Onboarding',
} as const;

export type EmailCategory = keyof typeof emailCategories;

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
