import { PlusIcon } from 'lucide-react';
import { MockBadge, Pill, Toggle } from './primitives';
import { FormInput, MockModal, SegmentedControl } from './primitives-ui';
import {
  BuilderSection,
  ReportFrame,
  SeriesRow,
  SettingRow,
} from './report-frame';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// The Conversion chart type: the rate from one event to another, per period.

const DAYS = [
  'Oct 19',
  'Oct 20',
  'Oct 21',
  'Oct 22',
  'Oct 23',
  'Oct 24',
  'Oct 25',
];
const RATE = [24.1, 27.3, 29.8, 31.2, 34.6, 38.0, 35.9];
const RATE_PREVIOUS = [22.0, 23.4, 25.1, 24.8, 26.2, 27.9, 28.3];
const AVERAGE = 31.4;

const SEGMENTS = [
  {
    name: 'Pro',
    colour: '#2563eb',
    rate: [31, 33, 36, 38, 41, 44, 43],
    avg: 38.0,
    total: 1204,
    conversions: 458,
  },
  {
    name: 'Team',
    colour: '#60a5fa',
    rate: [22, 24, 27, 28, 30, 33, 32],
    avg: 28.0,
    total: 980,
    conversions: 274,
  },
  {
    name: 'Free',
    colour: '#bfdbfe',
    rate: [12, 13, 15, 14, 16, 18, 17],
    avg: 15.0,
    total: 1662,
    conversions: 249,
  },
];

interface RateSeries {
  values: number[];
  colour: string;
  faded?: boolean;
}

// A line chart with a fixed 0–100 % axis, a dashed average and an optional
// vertical reference marker.
export function RateChart({
  series,
  average,
  height = 150,
  reference,
  labels = DAYS,
  className,
}: {
  series: RateSeries[];
  average?: number;
  height?: number;
  reference?: { index: number; label: string };
  labels?: string[];
  className?: string;
}) {
  const width = 600;
  const count = labels.length;
  const step = width / (count - 1);
  const y = (value: number) => height - (value / 100) * height;
  const path = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${index === 0 ? 'M' : 'L'}${index * step},${y(value)}`
      )
      .join(' ');
  return (
    <div className={cn('col gap-2', className)}>
      <div className="relative">
        <svg
          className="w-full"
          preserveAspectRatio="none"
          style={{ height }}
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>Conversion rate</title>
          {[0.25, 0.5, 0.75].map((line) => (
            <line
              key={line}
              stroke="#e5e5e5"
              strokeDasharray="3 4"
              x1="0"
              x2={width}
              y1={height * line}
              y2={height * line}
            />
          ))}
          {average !== undefined && (
            <line
              stroke="#737373"
              strokeDasharray="6 5"
              x1="0"
              x2={width}
              y1={y(average)}
              y2={y(average)}
            />
          )}
          {reference && (
            <line
              stroke="#171717"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              x1={reference.index * step}
              x2={reference.index * step}
              y1="0"
              y2={height}
            />
          )}
          {series.map((line) => (
            <path
              d={path(line.values)}
              fill="none"
              key={line.colour + String(line.faded)}
              stroke={line.colour}
              strokeOpacity={line.faded ? 0.35 : 1}
              strokeWidth={line.faded ? 1.5 : 2.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series
            .filter((line) => !line.faded)
            .map((line) =>
              line.values.map((value, index) => (
                <circle
                  cx={index * step}
                  cy={y(value)}
                  fill={line.colour}
                  key={`${line.colour}-${labels[index]}`}
                  r="3"
                />
              ))
            )}
        </svg>
        <span className="pointer-events-none absolute top-0 left-0 font-mono text-[10px] text-neutral-400">
          100%
        </span>
        <span className="pointer-events-none absolute bottom-0 left-0 font-mono text-[10px] text-neutral-400">
          0%
        </span>
        {average !== undefined && (
          <span
            className="pointer-events-none absolute right-0 rounded bg-white px-1 font-mono text-[10px] text-neutral-600 ring-1 ring-neutral-200"
            style={{ top: `calc(${100 - average}% - 18px)` }}
          >
            Average ({average}%)
          </span>
        )}
        {reference && (
          <span
            className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-1.5 py-0.5 font-medium text-[10px] text-white"
            style={{ left: `${(reference.index / (count - 1)) * 100}%` }}
          >
            {reference.label}
          </span>
        )}
      </div>
      <div className="row justify-between text-[11px] text-neutral-500">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function ConversionBuilder({ breakdown }: { breakdown?: string }) {
  return (
    <>
      <BuilderSection title="Metrics">
        <SeriesRow letter="A" name="sign_up" />
        <SeriesRow letter="B" name="purchase" />
        <span className="row items-center gap-1 px-1 text-[11px] text-neutral-400">
          <PlusIcon className="size-3" /> Add event (max 2)
        </span>
      </BuilderSection>
      <BuilderSection title="Breakdown">
        <span className="rounded-md bg-neutral-100 px-2 py-1.5 text-[11.5px] text-neutral-600">
          {breakdown ?? 'Add breakdown'}
        </span>
      </BuilderSection>
      <BuilderSection title="Settings">
        <SettingRow label="Funnel Group">
          <SegmentedControl items={['Session', 'Profile']} />
        </SettingRow>
        <SettingRow label="Funnel Window">
          <span className="font-mono text-neutral-800">24 h</span>
        </SettingRow>
        <SettingRow label="Y axis">
          <SegmentedControl items={['0–100%', 'Auto']} />
        </SettingRow>
        <SettingRow label="Compare to previous period">
          <Toggle />
        </SettingRow>
      </BuilderSection>
    </>
  );
}

function Stat({
  label,
  value,
  detail,
  change,
  negative,
}: {
  label: string;
  value: string;
  detail?: string;
  change?: string;
  negative?: boolean;
}) {
  return (
    <div className="col gap-0.5 bg-white p-3">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="row items-baseline gap-2">
        <span className="font-mono font-semibold text-[18px] tracking-tight">
          {value}
        </span>
        {change && (
          <span
            className={cn(
              'font-medium text-[11px]',
              negative ? 'text-red-600' : 'text-emerald-600'
            )}
          >
            {negative ? '↓' : '↑'} {change}
          </span>
        )}
      </span>
      {detail && (
        <span className="truncate text-[11px] text-neutral-500">{detail}</span>
      )}
    </div>
  );
}

export function ConversionStats({
  withBreakdown = false,
}: {
  withBreakdown?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200',
        withBreakdown ? 'grid-cols-3' : 'grid-cols-4'
      )}
    >
      <Stat change="2.1%" label="Conversion" value="31.4%" />
      <Stat detail="of 3,846 opportunities" label="Conversions" value="1,208" />
      <Stat detail="38.0%" label="Best day" value="Oct 24" />
      <Stat detail="24.1%" label="Worst day" value="Oct 19" />
      {withBreakdown && (
        <>
          <Stat detail="38.0%" label="Best breakdown" value="Pro" />
          <Stat detail="15.0%" label="Worst breakdown" value="Free" />
        </>
      )}
    </div>
  );
}

function heat(value: number) {
  return {
    backgroundColor: `rgba(37, 99, 235, ${0.08 + (value / 45) * 0.55})`,
  };
}

export function ConversionTable({ segments = false }: { segments?: boolean }) {
  const rows = segments
    ? SEGMENTS.map((segment) => ({ ...segment }))
    : [
        {
          name: 'sign_up → purchase',
          colour: '#2563eb',
          rate: RATE,
          avg: AVERAGE,
          total: 3846,
          conversions: 1208,
        },
      ];
  return (
    <div className="col min-w-[640px] overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_auto_repeat(7,44px)] gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>Series</span>
        <span className="text-right">Avg rate</span>
        <span className="text-right">Total</span>
        <span className="text-right">Conversions</span>
        {DAYS.map((day) => (
          <span className="truncate text-center" key={day}>
            {day.replace('Oct ', '')}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_auto_repeat(7,44px)] items-center gap-x-3 border-neutral-100 border-b px-3 py-1.5 text-[11.5px] last:border-b-0"
          key={row.name}
        >
          <span className="row items-center gap-2 truncate">
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: row.colour }}
            />
            <span className="truncate font-mono">{row.name}</span>
          </span>
          <span className="text-right font-mono">{row.avg}%</span>
          <span className="text-right font-mono text-neutral-600">
            {row.total.toLocaleString('en-US')}
          </span>
          <span className="text-right font-mono text-neutral-600">
            {row.conversions.toLocaleString('en-US')}
          </span>
          {row.rate.map((value, index) => (
            <span
              className="center-center rounded py-0.5 font-mono text-[10.5px] text-blue-950"
              key={DAYS[index]}
              style={heat(value)}
            >
              {value}%
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ConversionChartPanel({
  reference,
  segments = false,
}: {
  reference?: { index: number; label: string };
  segments?: boolean;
}) {
  const series: RateSeries[] = segments
    ? SEGMENTS.map((segment) => ({
        values: segment.rate,
        colour: segment.colour,
      }))
    : [
        { values: RATE_PREVIOUS, colour: '#2563eb', faded: true },
        { values: RATE, colour: '#2563eb' },
      ];
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="row items-center gap-3 text-[11px] text-neutral-600">
        {segments ? (
          SEGMENTS.map((segment) => (
            <span className="row items-center gap-1.5" key={segment.name}>
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: segment.colour }}
              />
              {segment.name}
            </span>
          ))
        ) : (
          <>
            <span className="row items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-blue-600" /> sign_up →
              purchase
            </span>
            <span className="row items-center gap-1.5 text-neutral-400">
              <span className="h-0.5 w-4 rounded bg-blue-600/40" /> previous
              period
            </span>
          </>
        )}
        <span className="ml-auto">Day</span>
      </div>
      <RateChart
        average={segments ? undefined : AVERAGE}
        reference={reference}
        series={series}
      />
    </div>
  );
}

export function ConversionReport() {
  return (
    <ReportFrame
      builder={<ConversionBuilder />}
      name="Sign-up to purchase"
      range="Last 7 days"
      type="Conversion"
    >
      <ConversionChartPanel />
      <ConversionStats />
      <ConversionTable />
    </ReportFrame>
  );
}

export function ConversionChartView() {
  return (
    <>
      <div className="row items-center gap-2">
        {['Minute', 'Hour', 'Day', 'Week', 'Month'].map((interval) => (
          <Pill active={interval === 'Day'} key={interval}>
            {interval}
          </Pill>
        ))}
        <span className="flex-1" />
        <span className="row items-center gap-2 text-[11.5px] text-neutral-600">
          Y axis <SegmentedControl items={['Fixed (0–100%)', 'Auto']} />
        </span>
      </div>
      <ConversionChartPanel />
      <ConversionStats />
    </>
  );
}

export function ConversionBreakdownView() {
  return (
    <>
      <ConversionChartPanel segments />
      <ConversionStats withBreakdown />
      <ConversionTable segments />
    </>
  );
}

export function ConversionReferenceView() {
  return (
    <div className="relative">
      <ConversionChartPanel
        reference={{ index: 3, label: 'Pricing page v2' }}
      />
      <div className="absolute top-10 right-6">
        <MockModal
          description="Mark this date on every chart in the project."
          title="Add reference"
          width={300}
        >
          <div className="col gap-2 text-[11.5px]">
            <span className="text-neutral-600">Title</span>
            <FormInput value="Pricing page v2" />
            <span className="text-neutral-600">Date</span>
            <FormInput mono value="2026-10-22 09:00" />
          </div>
          <Pill active className="w-fit">
            Add reference
          </Pill>
        </MockModal>
      </div>
    </div>
  );
}

export function MiniInterval() {
  return (
    <div className="col gap-3">
      <div className="row flex-wrap gap-1.5">
        {['Minute', 'Hour', 'Day', 'Week', 'Month'].map((interval) => (
          <Pill active={interval === 'Week'} key={interval}>
            {interval}
          </Pill>
        ))}
      </div>
      <RateChart
        height={70}
        labels={['W40', 'W41', 'W42', 'W43', 'W44']}
        series={[{ values: [26, 29, 31, 35, 37], colour: '#2563eb' }]}
      />
    </div>
  );
}

export function MiniConversionFlag() {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-[11.5px]">
      <span className="font-medium text-[12.5px]">Edit: purchase</span>
      <label className="row items-center gap-2">
        <span className="center-center size-3.5 rounded-sm bg-neutral-900 text-[9px] text-white">
          ✓
        </span>
        Yes, this event is important!
      </label>
      <span className="row items-center gap-2 text-neutral-500">
        Shown under
        <MockBadge tone="blue">Conversions</MockBadge>
        on the Events page
      </span>
    </div>
  );
}

export const CONVERSION_MOCKS = {
  conversion: {
    content: () => <ConversionReport />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 7 days' },
    insetWidth: 900,
  },
  'conversion-chart': {
    content: () => <ConversionChartView />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 7 days' },
    insetWidth: 800,
  },
  'conversion-breakdown': {
    content: () => <ConversionBreakdownView />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 7 days' },
    insetWidth: 860,
  },
  'conversion-reference': {
    content: () => <ConversionReferenceView />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 7 days' },
    insetWidth: 800,
  },
  'mini-interval': { content: () => <MiniInterval /> },
  'mini-conversion-flag': { content: () => <MiniConversionFlag /> },
} satisfies Record<string, MockDefinition>;
