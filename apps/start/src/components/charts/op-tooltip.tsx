import { getPreviousMetric } from '@openpanel/common';
import type { IInterval } from '@openpanel/validation';
import { type ReactNode, useMemo } from 'react';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { PreviousDiffIndicatorPure } from '../report-chart/common/previous-diff-indicator';
import { useChart } from './chart-context';
import type { ChartMarker } from './markers/marker-group';
import type { OPReferrerSpikeItem } from './op-referrer-spikes';
import { type OPReferenceItem, toChartMarkers } from './op-references';
import { ChartTooltip, type ChartTooltipProps } from './tooltip/chart-tooltip';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';

export type OPTooltipUnit =
  | 'currency'
  | 'min'
  | 'pct'
  | 'count'
  | 'raw'
  | string;

export interface OPTooltipRow {
  /** Color of the left strip — typically getChartColor(index) */
  color: string;
  /** Row label / series name */
  label: ReactNode;
  /** Primary numeric value. Omit for rows that only use `sub`. */
  value?: number | null;
  /** How to format `value`. Default: 'count' (locale string). */
  unit?: OPTooltipUnit;
  /** Optional previous-period value — shown as "(prev)" next to value */
  previous?: number | null;
  /** Whether higher previous is better (e.g. bounce rate is inverted) */
  inverted?: boolean;
  /** Whether to render the percentage diff badge */
  showDiff?: boolean;
  /** Optional percentage to append after the value, e.g. "12.3 (45%)" */
  percentage?: number | null;
  /** Optional icon shown before the label */
  icon?: ReactNode;
  /** Sub-rows shown below the main row (no left strip color) */
  sub?: Array<{
    label: ReactNode;
    value: number | string | null | undefined;
    unit?: OPTooltipUnit;
    color?: string;
  }>;
}

export interface OPChartTooltipProps<T extends Record<string, unknown>>
  extends Omit<ChartTooltipProps, 'content' | 'rows'> {
  /** Interval drives the date format in the title (when title is omitted). */
  interval?: IInterval;
  /** Override the default date title. Return null to hide it. */
  title?: (point: T) => ReactNode;
  /** Map a hovered point to one or more tooltip rows. */
  rows: (point: T) => OPTooltipRow[];
  /** Render extra content below the rows (e.g. referrer breakdown). */
  extra?: (point: T) => ReactNode;
  /** Min width of the tooltip card. Default 200. */
  minWidth?: number;
  /** When set, references matching the hovered date are listed below the rows. */
  references?: OPReferenceItem[] | null;
  /** Max references to list in the tooltip. Default 3. */
  referencesLimit?: number;
  /** Auto-detected referrer spikes; the matching bucket's spike is shown below. */
  spikes?: OPReferrerSpikeItem[] | null;
}

export function OPChartTooltip<T extends Record<string, unknown>>({
  interval,
  title,
  rows,
  extra,
  minWidth = 200,
  references,
  referencesLimit = 3,
  spikes,
  ...rest
}: OPChartTooltipProps<T>) {
  const referenceMarkers = useMemo(
    () => toChartMarkers(references),
    [references]
  );

  return (
    <ChartTooltip
      {...rest}
      content={({ point }) => (
        <OPTooltipBody
          extra={extra ? extra(point as T) : null}
          interval={interval}
          minWidth={minWidth}
          point={point as T}
          referenceMarkers={referenceMarkers}
          referencesLimit={referencesLimit}
          rows={rows(point as T)}
          spikes={spikes ?? null}
          title={title ? title(point as T) : undefined}
        />
      )}
    />
  );
}

interface OPTooltipBodyProps<T> {
  point: T;
  interval?: IInterval;
  title?: ReactNode;
  rows: OPTooltipRow[];
  extra?: ReactNode;
  minWidth: number;
  referenceMarkers: ChartMarker[];
  referencesLimit: number;
  spikes: OPReferrerSpikeItem[] | null;
}

function OPTooltipBody<T extends Record<string, unknown>>({
  point,
  interval,
  title,
  rows,
  extra,
  minWidth,
  referenceMarkers,
  referencesLimit,
  spikes,
}: OPTooltipBodyProps<T>) {
  const formatDate = useFormatDateInterval({
    interval: interval ?? 'day',
    short: false,
  });
  const activeReferences = useReferencesForHoveredPoint(referenceMarkers);
  const activeSpike = useSpikeForHoveredPoint(spikes);

  const resolvedTitle = useMemo(() => {
    if (title === null) {
      return null;
    }
    if (title !== undefined) {
      return title;
    }
    const dateValue = point.date as Date | string | number | undefined;
    if (!dateValue) {
      return null;
    }
    return formatDate(new Date(dateValue));
  }, [title, point, formatDate]);

  return (
    <OPTooltipCard style={{ minWidth }}>
      {resolvedTitle != null && (
        <div className="flex justify-between gap-8 text-muted-foreground">
          <div>{resolvedTitle}</div>
        </div>
      )}
      {rows.map((row, index) => (
        <OPTooltipRowView key={`${row.label}-${index}`} row={row} />
      ))}
      {extra}
      <OPAnnotationsBlock
        references={activeReferences}
        referencesLimit={referencesLimit}
        spike={activeSpike}
      />
    </OPTooltipCard>
  );
}

/**
 * Returns references whose timestamp falls in the bucket of the currently
 * hovered data point. We snap each reference to its nearest data index and
 * compare against `tooltipData.index` — fine-grained enough for hourly /
 * minute intervals (bklit's built-in `useActiveMarkers` only matches by day).
 *
 * The nearest-index pass is O(refs × data) and only depends on inputs that
 * change rarely (refs, data), so it's precomputed once and cached. Hover
 * filtering then runs in O(refs) per mouse move instead of O(refs × data).
 */
function useReferencesForHoveredPoint(
  references: ChartMarker[]
): ChartMarker[] {
  const { tooltipData, data, xAccessor } = useChart();

  const nearestIndices = useMemo(
    () => computeNearestIndices(references, data, xAccessor, (m) => m.date),
    [references, data, xAccessor]
  );

  return useMemo(() => {
    if (!tooltipData || references.length === 0) {
      return [];
    }
    const hoveredIndex = tooltipData.index;
    return references.filter(
      (_, refIdx) => nearestIndices[refIdx] === hoveredIndex
    );
  }, [tooltipData, references, nearestIndices]);
}

function useSpikeForHoveredPoint(
  spikes: OPReferrerSpikeItem[] | null,
): OPReferrerSpikeItem | null {
  const { tooltipData, data, xAccessor } = useChart();

  const nearestIndices = useMemo(
    () =>
      computeNearestIndices(spikes ?? [], data, xAccessor, (s) =>
        typeof s.date === 'string' ? new Date(s.date) : s.date,
      ),
    [spikes, data, xAccessor],
  );

  return useMemo(() => {
    if (!tooltipData || !spikes || spikes.length === 0) {
      return null;
    }
    const hoveredIndex = tooltipData.index;
    for (let i = 0; i < spikes.length; i++) {
      if (nearestIndices[i] === hoveredIndex) {
        return spikes[i] ?? null;
      }
    }
    return null;
  }, [tooltipData, spikes, nearestIndices]);
}

/**
 * For each item, return the index of the nearest data point by xAccessor time.
 * Pre-computed once per (items, data, xAccessor) so hover handlers can do O(1)
 * lookups instead of O(items × data) scans on every mouse move.
 */
function computeNearestIndices<T>(
  items: T[],
  data: Record<string, unknown>[],
  xAccessor: (d: Record<string, unknown>) => Date,
  getDate: (item: T) => Date,
): number[] {
  if (items.length === 0 || data.length === 0) {
    return [];
  }
  const dataTimes = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    dataTimes[i] = point ? xAccessor(point).getTime() : Number.NaN;
  }
  return items.map((item) => {
    const target = getDate(item).getTime();
    let nearestIdx = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < dataTimes.length; i++) {
      const t = dataTimes[i]!;
      if (Number.isNaN(t)) continue;
      const diff = Math.abs(t - target);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = i;
      }
    }
    return nearestIdx;
  });
}

function OPAnnotationsBlock({
  references,
  referencesLimit,
  spike,
}: {
  references: ChartMarker[];
  referencesLimit: number;
  spike: OPReferrerSpikeItem | null;
}) {
  const visibleRefs = references.slice(0, referencesLimit);
  const hiddenRefs = Math.max(0, references.length - referencesLimit);
  if (visibleRefs.length === 0 && !spike) return null;

  return (
    <div className="col mt-1 gap-2 border-border border-t pt-2">
      {visibleRefs.map((marker) => (
        <OPAnnotationRow
          key={marker.title}
          icon={marker.icon}
          title={marker.title}
          description={marker.description}
        />
      ))}
      {hiddenRefs > 0 && (
        <div className="pl-8 text-muted-foreground text-xs">
          +{hiddenRefs} more
        </div>
      )}
      {spike && <OPSpikeAnnotation spike={spike} />}
    </div>
  );
}

function OPSpikeAnnotation({ spike }: { spike: OPReferrerSpikeItem }) {
  const number = useNumber();
  const sessionsLabel = `${number.short(spike.sessions)} sessions`;
  const comparison = spike.isNew
    ? 'first time this period'
    : `${spike.ratio.toFixed(1)}× typical`;
  const sharePct = `${Math.round(spike.share * 100)}% of bucket`;

  const description = (
    <>
      <div className="truncate">
        {sessionsLabel} · {comparison} · {sharePct}
      </div>
      {spike.others.length > 0 && (
        <div className="mt-0.5 truncate">
          + also: {spike.others.map((o) => o.referrer_name).join(', ')}
        </div>
      )}
    </>
  );

  return (
    <OPAnnotationRow
      icon={<SerieIcon fill name={spike.referrer_name} />}
      title={`Spike from ${spike.referrer_name}`}
      description={description}
    />
  );
}

/**
 * Single row used for every tooltip annotation (user references + auto-
 * detected referrer spikes). Matches the chart-marker visual: the icon
 * fills the circle, surrounded by a high-contrast border. Callers pass
 * fill-aware icons (e.g. `<SerieIcon fill />` or a sized Lucide icon).
 */
function OPAnnotationRow({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground text-foreground">
        {icon}
      </div>
      <div className="col min-w-0 flex-1 gap-0.5">
        <div className="truncate font-medium text-sm leading-tight">
          {title}
        </div>
        {description && (
          <div className="truncate text-muted-foreground text-xs leading-snug">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

export function OPTooltipCard({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        'col gap-2 rounded-xl border border-border/60 p-3 text-foreground shadow-xl',
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

function OPTooltipRowView({ row }: { row: OPTooltipRow }) {
  const number = useNumber();
  const hasValue = row.value != null;
  const prev = row.previous ?? null;
  const showPrev = prev != null && prev !== 0;
  const showDiff = row.showDiff !== false && showPrev;
  const diff =
    showDiff && hasValue ? getPreviousMetric(row.value!, prev) : null;

  return (
    <div className="flex gap-2">
      <div className="w-[3px] rounded-full" style={{ background: row.color }} />
      <div className="col min-w-0 flex-1 gap-1">
        <div className="flex min-w-0 items-center gap-1">
          {row.icon && (
            <span className="flex shrink-0 items-center">{row.icon}</span>
          )}
          <span className="truncate font-medium">{row.label}</span>
        </div>
        {hasValue && (
          <div className="flex items-center justify-between gap-8 font-medium font-mono">
            <div className="row items-baseline gap-1">
              <span>{formatOPValue(row.value!, row.unit, number)}</span>
              {showPrev && (
                <span className="text-muted-foreground">
                  ({formatOPValue(prev, row.unit, number)})
                </span>
              )}
              {row.percentage != null && (
                <span className="text-muted-foreground">
                  ({number.format(row.percentage)}%)
                </span>
              )}
            </div>
            {diff && (
              <PreviousDiffIndicatorPure {...diff} inverted={row.inverted} />
            )}
          </div>
        )}

        {row.sub && row.sub.length > 0 && (
          <div className="col gap-1 text-sm">
            {row.sub.map((s, i) => (
              <div
                className="flex justify-between gap-8 font-medium font-mono"
                key={`${typeof s.label === 'string' ? s.label : i}-${i}`}
              >
                <span className="text-muted-foreground">{s.label}</span>
                <span style={s.color ? { color: s.color } : undefined}>
                  {formatOPValue(s.value as number | string, s.unit, number)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatOPValue(
  value: number | string | null | undefined,
  unit: OPTooltipUnit | undefined,
  number: ReturnType<typeof useNumber>
): string {
  if (value == null) {
    return '–';
  }
  if (typeof value === 'string') {
    return value;
  }

  switch (unit) {
    case 'currency':
      // Stored in cents — convert to dollars
      return number.currency(value / 100, { short: true });
    case 'min':
      return fancyMinutes(value);
    case 'pct':
      return `${number.format(value)} %`;
    case 'raw':
      return String(value);
    default:
      return number.short(value);
  }
}
