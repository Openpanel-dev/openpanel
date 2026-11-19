import type { HeatmapLevelStyles } from './heatmap-colors';
import type { HeatmapBin, HeatmapColumn } from './heatmap-context';

/** Calendar months shown in default one-year contribution grids. */
export const HEATMAP_MONTHS_ONE_YEAR = 12;

/** Half-year contribution grids (gallery card demos). */
export const HEATMAP_MONTHS_SIX = 6;

/** Nominal week count for one year (~52). Default data uses calendar-month math instead. */
export const HEATMAP_WEEKS_ONE_YEAR = 52;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = MS_PER_DAY * 7;

export function getHeatmapCalendarRangeStart(
  today: Date,
  months: number
): Date {
  const monthOffset = months === HEATMAP_MONTHS_SIX ? months : months - 1;
  const start = new Date(
    today.getFullYear(),
    today.getMonth() - monthOffset,
    1
  );
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getHeatmapYearStartMonth(today: Date): Date {
  return getHeatmapCalendarRangeStart(today, HEATMAP_MONTHS_ONE_YEAR);
}

export function getHeatmapWeekStartSunday(date: Date): Date {
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

export function getHeatmapWeekCount(startSunday: Date, endDate: Date): number {
  const endSunday = getHeatmapWeekStartSunday(endDate);
  return (
    Math.floor((endSunday.getTime() - startSunday.getTime()) / MS_PER_WEEK) + 1
  );
}

/** Days in a Sun–Sat column on or after `threshold` (for trimming partial lead weeks). */
export function countHeatmapWeekDaysOnOrAfter(
  weekStart: Date,
  threshold: Date
): number {
  const day = new Date(weekStart);
  day.setHours(0, 0, 0, 0);
  const cutoff = new Date(threshold);
  cutoff.setHours(0, 0, 0, 0);
  let count = 0;

  for (let i = 0; i < 7; i++) {
    if (day >= cutoff) {
      count++;
    }
    day.setDate(day.getDate() + 1);
  }

  return count;
}

/**
 * First Sunday week column where enough days fall on/after `rangeStart`.
 * Skips a lead week that is mostly before the range (e.g. late July before Aug 1).
 */
export function getHeatmapWeekStartAlignedToRange(
  rangeStart: Date,
  minDaysInFirstWeek = 4
): Date {
  const startDate = getHeatmapWeekStartSunday(rangeStart);
  const weekEnd = new Date(startDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Keep the Sun–Sat column that contains the 1st (e.g. Jan 1 in a partial lead week).
  if (rangeStart >= startDate && rangeStart <= weekEnd) {
    return startDate;
  }

  while (
    countHeatmapWeekDaysOnOrAfter(startDate, rangeStart) < minDaysInFirstWeek
  ) {
    startDate.setDate(startDate.getDate() + 7);
  }

  return startDate;
}

/** Column index for a month label — snaps to separator group start when layout is set. */
export function getHeatmapMonthLabelColumnIndex(
  columnIndex: number,
  separatorLayout: Pick<HeatmapSeparatorLayout, 'atColumns'> | null
): number {
  if (!separatorLayout?.atColumns.length) {
    return columnIndex;
  }

  return getHeatmapSeparatorGroupStartColumn(
    columnIndex,
    separatorLayout.atColumns
  );
}

export interface HeatmapWeekRange {
  startDate: Date;
  weekCount: number;
  /** First in-range calendar day; bins before this are empty in default year grids. */
  rangeStart: Date | null;
}

/** Default `weeks` uses 12 calendar months; other values use a rolling week window. */
export function resolveHeatmapWeekRange(
  today: Date,
  weeks: number = HEATMAP_WEEKS_ONE_YEAR
): HeatmapWeekRange {
  const endDate = new Date(today);
  endDate.setHours(0, 0, 0, 0);

  if (weeks === HEATMAP_WEEKS_ONE_YEAR) {
    const rangeStart = getHeatmapYearStartMonth(endDate);
    const startDate = getHeatmapWeekStartAlignedToRange(rangeStart);
    return {
      startDate,
      weekCount: getHeatmapWeekCount(startDate, endDate),
      rangeStart,
    };
  }

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  startDate.setHours(0, 0, 0, 0);

  return {
    startDate,
    weekCount: weeks,
    rangeStart: null,
  };
}

/** Month label anchor for a week column — prefers the 1st, else the 1st of the first bin's month. */
export function getHeatmapColumnMonthAnchor(
  column: HeatmapColumn
): Date | null {
  for (const bin of column.bins) {
    if (bin.date && bin.date.getDate() === 1) {
      return bin.date;
    }
  }

  const firstDate = column.bins[0]?.date;
  if (!firstDate) {
    return null;
  }

  return new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
}

export function getHeatmapColumnStartDate(column: HeatmapColumn): Date | null {
  return column.bins[0]?.date ?? null;
}

export function getHeatmapColumnEndDate(column: HeatmapColumn): Date | null {
  const lastBin = column.bins.at(-1);
  return lastBin?.date ?? null;
}

export function getHeatmapTimeExtent(
  columns: HeatmapColumn[]
): [Date, Date] | null {
  if (columns.length === 0) {
    return null;
  }

  const firstColumn = columns[0];
  if (!firstColumn) {
    return null;
  }
  const start = getHeatmapColumnStartDate(firstColumn);
  const lastColumn = columns.at(-1);
  if (!lastColumn) {
    return null;
  }
  const end = getHeatmapColumnEndDate(lastColumn);
  if (!(start && end)) {
    return null;
  }

  return [start, end];
}

export function filterHeatmapColumns(
  columns: HeatmapColumn[],
  xDomain?: [Date, Date]
): HeatmapColumn[] {
  if (!xDomain) {
    return columns;
  }

  const start = Math.min(xDomain[0].getTime(), xDomain[1].getTime());
  const end = Math.max(xDomain[0].getTime(), xDomain[1].getTime());

  return columns.filter((column) => {
    const weekStart = getHeatmapColumnStartDate(column)?.getTime();
    const weekEnd = getHeatmapColumnEndDate(column)?.getTime();
    if (weekStart == null || weekEnd == null) {
      return false;
    }
    return weekEnd >= start && weekStart <= end;
  });
}

const heatmapTooltipMonthFmt = new Intl.DateTimeFormat('en-US', {
  month: 'long',
});

const heatmapTooltipWeekdayFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
});

function formatHeatmapOrdinalDay(day: number): string {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** Tooltip header date — e.g. `January 20th 2026`. */
export function formatHeatmapTooltipDate(date: Date): string {
  const month = heatmapTooltipMonthFmt.format(date);
  const day = formatHeatmapOrdinalDay(date.getDate());
  return `${month} ${day} ${date.getFullYear()}`;
}

/** Tooltip weekday line — e.g. `Monday`. */
export function formatHeatmapTooltipWeekday(date: Date): string {
  return heatmapTooltipWeekdayFmt.format(date);
}

/** Tooltip contribution line — e.g. `3 contributions`. */
export function formatHeatmapContributionLabel(
  count: number,
  _date?: Date
): string {
  const word = count === 1 ? 'contribution' : 'contributions';
  return `${count} ${word}`;
}

/** Sunday-first day labels for heatmap row bins. */
export const HEATMAP_DAY_LABELS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

/** First row of the grid — `0` = Sunday (GitHub default). */
export type HeatmapWeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Day labels with row 0 aligned to `weekStartDay`. */
export function getHeatmapDayLabels(
  weekStartDay: HeatmapWeekStartDay = 0
): readonly string[] {
  if (weekStartDay === 0) {
    return HEATMAP_DAY_LABELS;
  }

  return [
    ...HEATMAP_DAY_LABELS.slice(weekStartDay),
    ...HEATMAP_DAY_LABELS.slice(0, weekStartDay),
  ];
}

/** Rotates Sun-first column bins so display row 0 starts on `weekStartDay`. */
export function rotateHeatmapColumnBins(
  columns: HeatmapColumn[],
  weekStartDay: HeatmapWeekStartDay = 0
): HeatmapColumn[] {
  if (weekStartDay === 0) {
    return columns;
  }

  return columns.map((column) => ({
    ...column,
    bins: [
      ...column.bins.slice(weekStartDay),
      ...column.bins.slice(0, weekStartDay),
    ],
  }));
}

/** Which Y-axis row ticks to display. */
export type HeatmapYAxisTickFilter = 'all' | 'odd' | 'even';

/** Y-axis label display — `initial` shows the first letter only (Mon → M). */
export type HeatmapYAxisLabelFormat = 'full' | 'initial';

export function formatHeatmapYAxisLabel(
  label: string,
  labelFormat: HeatmapYAxisLabelFormat
): string {
  return labelFormat === 'initial' ? label.charAt(0) : label;
}

export function shouldShowHeatmapYAxisTick(
  row: number,
  tickFilter: HeatmapYAxisTickFilter
): boolean {
  switch (tickFilter) {
    case 'all':
      return true;
    case 'odd':
      return row % 2 === 1;
    case 'even':
      return row % 2 === 0;
    default:
      return row % 2 === 1;
  }
}

/** Layout spacing parsed from {@link HeatmapSeparator}. */
export type HeatmapSeparatorGroupBy = 'every' | 'quarter';

/** Separator config from props — resolved to column indices once data is known. */
export interface HeatmapSeparatorParsedConfig {
  groupBy: HeatmapSeparatorGroupBy;
  every?: number;
  spacing: number;
}

export interface HeatmapSeparatorGroup {
  startColumnIndex: number;
  quarter: number;
  year: number;
  startDate: Date;
  label: string;
}

/** Resolved separator layout used for column offsets and rendering. */
export interface HeatmapSeparatorLayout {
  spacing: number;
  atColumns: number[];
  groups: HeatmapSeparatorGroup[];
}

/** Separator line style. */
export type HeatmapSeparatorStrokeStyle = 'solid' | 'dashed';

/** Vertical stroke gradient for separator lines (`from` → optional `via` → `to`). */
export interface HeatmapSeparatorGradient {
  from: string;
  via?: string;
  to: string;
  fromOpacity?: number;
  viaOpacity?: number;
  toOpacity?: number;
}

export interface HeatmapSeparatorGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

/** Builds SVG gradient stops for a vertical separator line. */
export function buildHeatmapSeparatorGradientStops(
  gradient: HeatmapSeparatorGradient,
  strokeOpacity = 1
): HeatmapSeparatorGradientStop[] {
  const scaleOpacity = (value: number | undefined, fallback = 1) =>
    (value ?? fallback) * strokeOpacity;

  if (gradient.via != null) {
    return [
      {
        offset: '0%',
        color: gradient.from,
        opacity: scaleOpacity(gradient.fromOpacity),
      },
      {
        offset: '50%',
        color: gradient.via,
        opacity: scaleOpacity(gradient.viaOpacity),
      },
      {
        offset: '100%',
        color: gradient.to,
        opacity: scaleOpacity(gradient.toOpacity),
      },
    ];
  }

  return [
    {
      offset: '0%',
      color: gradient.from,
      opacity: scaleOpacity(gradient.fromOpacity),
    },
    {
      offset: '100%',
      color: gradient.to,
      opacity: scaleOpacity(gradient.toOpacity),
    },
  ];
}

export function resolveHeatmapSeparatorStrokeDasharray(
  strokeStyle: HeatmapSeparatorStrokeStyle = 'solid',
  strokeDasharray?: string
): string | undefined {
  if (strokeStyle !== 'dashed') {
    return undefined;
  }
  return strokeDasharray ?? '4,4';
}

/** Calendar quarter (1–4) for Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. */
export function getCalendarQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

const CALENDAR_QUARTER_START_MONTHS = [0, 3, 6, 9] as const;

/** Jan/Apr/Jul/Oct 1 dates strictly after `gridStart` and on or before `gridEnd`. */
export function getCalendarQuarterStartDatesBetween(
  gridStart: Date,
  gridEnd: Date
): Date[] {
  const startTime = gridStart.getTime();
  const endTime = gridEnd.getTime();
  const dates: Date[] = [];

  for (
    let year = gridStart.getFullYear();
    year <= gridEnd.getFullYear();
    year++
  ) {
    for (const month of CALENDAR_QUARTER_START_MONTHS) {
      const date = new Date(year, month, 1);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();
      if (time > startTime && time <= endTime) {
        dates.push(date);
      }
    }
  }

  return dates;
}

/** Week column index whose Sun–Sat span contains `date`. */
export function findHeatmapColumnIndexForDate(
  columns: HeatmapColumn[],
  date: Date
): number | null {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const targetTime = target.getTime();

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex];
    if (!column) {
      continue;
    }

    const weekStart = getHeatmapColumnStartDate(column);
    const weekEnd = getHeatmapColumnEndDate(column);
    if (!(weekStart && weekEnd)) {
      continue;
    }

    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(0, 0, 0, 0);
    if (targetTime >= weekStart.getTime() && targetTime <= weekEnd.getTime()) {
      return columnIndex;
    }
  }

  return null;
}

/** Quarter anchor for a week column — prefers the 1st of a quarter month, else the quarter of the first bin. */
export function getHeatmapColumnQuarterAnchor(column: HeatmapColumn): {
  quarter: number;
  year: number;
  date: Date;
} | null {
  for (const bin of column.bins) {
    if (!bin.date) {
      continue;
    }
    const month = bin.date.getMonth();
    if (bin.date.getDate() === 1 && month % 3 === 0) {
      return {
        quarter: month / 3 + 1,
        year: bin.date.getFullYear(),
        date: bin.date,
      };
    }
  }

  const firstDate = column.bins[0]?.date;
  if (!firstDate) {
    return null;
  }

  const quarter = getCalendarQuarter(firstDate);
  return {
    quarter,
    year: firstDate.getFullYear(),
    date: new Date(firstDate.getFullYear(), (quarter - 1) * 3, 1),
  };
}

/** Label column snapped to the start of a separator group. */
export function getHeatmapSeparatorGroupStartColumn(
  columnIndex: number,
  atColumns: number[]
): number {
  let groupStart = 0;

  for (const start of atColumns) {
    if (start <= columnIndex) {
      groupStart = start;
    } else {
      break;
    }
  }

  return groupStart;
}

/** Column indices (0-based) where a vertical separator is drawn (fixed interval). */
export function getHeatmapSeparatorColumnIndices(
  columnCount: number,
  every: number
): number[] {
  if (every <= 0 || columnCount <= every) {
    return [];
  }

  const indices: number[] = [];
  for (
    let columnIndex = every;
    columnIndex < columnCount;
    columnIndex += every
  ) {
    indices.push(columnIndex);
  }
  return indices;
}

/** Matches demo-style calendar grids to their range start (Jan 1, etc.). */
export function inferHeatmapCalendarRangeStart(
  columns: HeatmapColumn[]
): Date | null {
  const firstColumn = columns[0];
  if (!firstColumn) {
    return null;
  }

  const gridStart = getHeatmapColumnStartDate(firstColumn);
  if (!gridStart) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const months of [HEATMAP_MONTHS_SIX, HEATMAP_MONTHS_ONE_YEAR]) {
    const rangeStart = getHeatmapCalendarRangeStart(today, months);
    const alignedStart = getHeatmapWeekStartAlignedToRange(rangeStart);
    if (gridStart.getTime() === alignedStart.getTime()) {
      return rangeStart;
    }
  }

  return null;
}

export function buildHeatmapQuarterSeparatorGroups(
  columns: HeatmapColumn[]
): HeatmapSeparatorGroup[] {
  if (columns.length === 0) {
    return [];
  }

  const extent = getHeatmapTimeExtent(columns);
  if (!extent) {
    return [];
  }

  const [extentStart, gridEnd] = extent;
  const displayRange = resolveHeatmapDisplayRange(columns);
  const quarterRangeStart =
    displayRange.start ??
    inferHeatmapCalendarRangeStart(columns) ??
    extentStart;
  const firstQuarter = getCalendarQuarter(quarterRangeStart);

  const groups: HeatmapSeparatorGroup[] = [
    {
      startColumnIndex: 0,
      quarter: firstQuarter,
      year: quarterRangeStart.getFullYear(),
      startDate: quarterRangeStart,
      label: `Q${firstQuarter}`,
    },
  ];

  const usedColumns = new Set<number>([0]);
  const quarterStarts = getCalendarQuarterStartDatesBetween(
    quarterRangeStart,
    gridEnd
  );

  for (const quarterStart of quarterStarts) {
    const columnIndex = findHeatmapColumnIndexForDate(columns, quarterStart);
    if (
      columnIndex == null ||
      columnIndex === 0 ||
      usedColumns.has(columnIndex)
    ) {
      continue;
    }

    usedColumns.add(columnIndex);
    const quarter = getCalendarQuarter(quarterStart);
    groups.push({
      startColumnIndex: columnIndex,
      quarter,
      year: quarterStart.getFullYear(),
      startDate: quarterStart,
      label: `Q${quarter}`,
    });
  }

  groups.sort((a, b) => a.startColumnIndex - b.startColumnIndex);
  return groups;
}

export function resolveHeatmapSeparatorLayout(
  config: HeatmapSeparatorParsedConfig | null,
  columns: HeatmapColumn[]
): HeatmapSeparatorLayout | null {
  if (!config) {
    return null;
  }

  if (config.groupBy === 'quarter') {
    const groups = buildHeatmapQuarterSeparatorGroups(columns);
    if (groups.length === 0) {
      return null;
    }

    return {
      spacing: config.spacing,
      atColumns: groups
        .map((group) => group.startColumnIndex)
        .filter((columnIndex) => columnIndex > 0),
      groups,
    };
  }

  if (!config.every || config.every <= 0) {
    return null;
  }

  const atColumns = getHeatmapSeparatorColumnIndices(
    columns.length,
    config.every
  );

  return {
    spacing: config.spacing,
    atColumns,
    groups: [],
  };
}

export function getHeatmapSeparatorCount(
  separator: Pick<HeatmapSeparatorLayout, 'atColumns'> | null
): number {
  return separator?.atColumns.length ?? 0;
}

/** Extra x-offset for a column when separator spacing is enabled. */
export function getHeatmapColumnXOffset(
  columnIndex: number,
  separator: Pick<HeatmapSeparatorLayout, 'spacing' | 'atColumns'> | null
): number {
  if (!separator || separator.spacing <= 0) {
    return 0;
  }
  if (columnIndex <= 0) {
    return 0;
  }

  const separatorCount = separator.atColumns.filter(
    (atColumn) => atColumn <= columnIndex
  ).length;
  return separatorCount * separator.spacing;
}

export function getHeatmapPlotInnerWidth(
  columnCount: number,
  binWidth: number,
  separator: Pick<HeatmapSeparatorLayout, 'spacing' | 'atColumns'> | null
): number {
  const separatorCount = separator ? getHeatmapSeparatorCount(separator) : 0;
  return columnCount * binWidth + separatorCount * (separator?.spacing ?? 0);
}

/** Vertical span for a separator line in plot coordinates. */
export function getHeatmapSeparatorLineY({
  innerHeight,
  marginTop,
  startOffset,
  paddingY = 0,
}: {
  innerHeight: number;
  marginTop: number;
  /** Distance from the chart container top to the line start. Default: plot top. */
  startOffset?: number;
  paddingY?: number;
}): { y1: number; y2: number } {
  const resolvedStart = startOffset ?? marginTop;
  const y1 = resolvedStart - marginTop + paddingY;
  const y2 = Math.max(innerHeight - paddingY, y1);
  return { y1, y2 };
}

/** X position for a separator line (centered in the gutter when spacing > 0). */
export function getHeatmapSeparatorX(
  columnIndex: number,
  gap: number,
  separator: Pick<HeatmapSeparatorLayout, 'spacing'>,
  xScale: (columnIndex: number) => number
): number {
  if (separator.spacing > 0) {
    return xScale(columnIndex) - separator.spacing / 2;
  }
  return xScale(columnIndex) - gap / 2;
}

export interface HeatmapDisplayRange {
  start: Date | null;
  end: Date | null;
}

/** Whether a bin falls outside the contribution display window (not merely inactive). */
export function isHeatmapGhostBin(
  bin: HeatmapBin,
  range: HeatmapDisplayRange
): boolean {
  const time = bin.date.getTime();
  if (range.end && time > range.end.getTime()) {
    return true;
  }
  if (range.start && time < range.start.getTime()) {
    return true;
  }
  return false;
}

/**
 * Infers GitHub-style display range for calendar-month contribution grids.
 * Custom data that does not match a known grid shape returns null bounds (show all).
 */
export function resolveHeatmapDisplayRange(
  columns: HeatmapColumn[]
): HeatmapDisplayRange {
  if (columns.length === 0) {
    return { start: null, end: null };
  }

  const extent = getHeatmapTimeExtent(columns);
  if (!extent) {
    return { start: null, end: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstColumn = columns[0];
  if (!firstColumn) {
    return { start: null, end: null };
  }

  const gridStart = getHeatmapColumnStartDate(firstColumn);
  if (!gridStart) {
    return { start: null, end: null };
  }

  const inferredStart = inferHeatmapCalendarRangeStart(columns);

  if (inferredStart && extent[1].getTime() >= today.getTime()) {
    return { start: inferredStart, end: today };
  }

  return { start: null, end: null };
}

/** Maps a contribution count to the GitHub-style legend level (0–4). */
export function getHeatmapContributionLevel(count: number): number {
  if (count <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
  }
  if (count === 2) {
    return 2;
  }
  if (count === 3) {
    return 3;
  }
  return 4;
}

export interface HeatmapHoverStyleParams {
  inactiveOpacity: number;
  inactiveScale: number;
  activeScale: number;
}

/** Whether hover styling runs (disabled when all scale/opacity props are 1). */
export function isHeatmapHoverEffectEnabled(
  params: HeatmapHoverStyleParams
): boolean {
  return (
    params.inactiveOpacity !== 1 ||
    params.inactiveScale !== 1 ||
    params.activeScale !== 1
  );
}

/** Whether inactive hover styling runs (disabled when both props are 1). */
export function isHeatmapInactiveEffectEnabled(
  inactiveOpacity: number,
  inactiveScale: number
): boolean {
  return isHeatmapHoverEffectEnabled({
    inactiveOpacity,
    inactiveScale,
    activeScale: 1,
  });
}

/** Opacity and scale for highlighted vs dimmed cells and legend swatches. */
export function resolveHeatmapHoverStyle(
  isHighlighted: boolean,
  isDimmed: boolean,
  params: HeatmapHoverStyleParams
): { opacity: number; scale: number } {
  if (isHighlighted && params.activeScale !== 1) {
    return { opacity: 1, scale: params.activeScale };
  }

  if (isDimmed) {
    return {
      opacity: params.inactiveOpacity,
      scale: params.inactiveScale,
    };
  }

  return { opacity: 1, scale: 1 };
}

/** Opacity and scale for an inactive cell or legend swatch. */
export function resolveHeatmapInactiveStyle(
  isInactive: boolean,
  inactiveOpacity: number,
  inactiveScale: number
): { opacity: number; scale: number } {
  return resolveHeatmapHoverStyle(false, isInactive, {
    inactiveOpacity,
    inactiveScale,
    activeScale: 1,
  });
}

/** Per-row opacity multiplier for display rows (default 1). */
export function resolveHeatmapRowOpacity(
  row: number,
  rowOpacity?: number | readonly number[]
): number {
  if (rowOpacity == null) {
    return 1;
  }

  if (typeof rowOpacity === 'number') {
    return rowOpacity;
  }

  return rowOpacity[row] ?? 1;
}

/**
 * Builds a per-row opacity map for {@link HeatmapCells} and {@link HeatmapYAxis}.
 * Pass explicit row indices (e.g. `[5, 6]` for display Sat/Sun when `weekStartDay={1}`)
 * or a predicate — `(row) => row >= 5` fades the last two rows.
 */
export function buildHeatmapRowOpacity(
  match: readonly number[] | ((row: number) => boolean),
  fadedOpacity = 0.35,
  activeOpacity = 1,
  rowCount = 7
): number[] {
  if (typeof match === 'function') {
    return Array.from({ length: rowCount }, (_, row) =>
      match(row) ? fadedOpacity : activeOpacity
    );
  }

  const opacity = new Array<number>(rowCount).fill(activeOpacity);
  for (const row of match) {
    if (row >= 0 && row < rowCount) {
      opacity[row] = fadedOpacity;
    }
  }
  return opacity;
}

/** CSS `linear-gradient` for a continuous legend bar from level styles. */
export function buildHeatmapLegendGradient(
  levelStyles: HeatmapLevelStyles
): string {
  const lastIndex = levelStyles.length - 1;
  const stops = levelStyles.map((style, index) => {
    const offset = lastIndex === 0 ? 0 : (index / lastIndex) * 100;
    return `${style.color} ${offset}%`;
  });

  return `linear-gradient(to right, ${stops.join(', ')})`;
}
