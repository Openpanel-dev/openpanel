import {
  ChevronDownIcon,
  GripVerticalIcon,
  Share2Icon,
  SparklesIcon,
} from 'lucide-react';
import {
  AreaChart,
  BarChart,
  BarSpark,
  HeatGrid,
  MockBadge,
  MockTabs,
  Panel,
  Pill,
  Toggle,
} from './primitives';
import { FormInput, MockSheet, SegmentedControl } from './primitives-ui';
import { JOURNEY_COLUMNS, JOURNEY_LINKS, SankeyMock } from './sankey';
import type { MockDefinition } from './types';
import { MockMap } from './web-realtime';
import { cn } from '@/lib/utils';

// Report editor, chart types, dashboards and the sankey.

export const CHART_TYPES = [
  'Linear',
  'Bar',
  'Histogram',
  'Pie',
  'Metric',
  'Area',
  'Map',
  'Funnel',
  'Retention',
  'Conversion',
  'Sankey',
] as const;

const SIGNUPS = [31, 28, 36, 42, 39, 48, 57, 61];
const SIGNUPS_PREVIOUS = [22, 24, 23, 29, 31, 30, 34, 36];
const LABELS = ['Oct 1', 'Oct 9', 'Oct 17', 'Oct 25'];

function SeriesRow({
  letter,
  event,
  segment,
}: {
  letter: string;
  event: string;
  segment: string;
}) {
  return (
    <div className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11.5px]">
      <GripVerticalIcon className="size-3 text-neutral-300" />
      <span className="center-center size-4 rounded bg-neutral-900 font-mono text-[9px] text-white">
        {letter}
      </span>
      <span className="font-mono">{event}</span>
      <span className="ml-auto text-neutral-500">{segment}</span>
      <ChevronDownIcon className="size-3 text-neutral-400" />
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="col gap-2">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        {title}
      </span>
      {children}
    </div>
  );
}

function ReportBuilder() {
  return (
    <MockSheet
      className="rounded-lg shadow-none"
      footer={<Pill active>Done</Pill>}
      title="Report builder"
      width={300}
    >
      <SidebarSection title="Metrics">
        <SeriesRow event="screen_view" letter="A" segment="Unique users" />
        <SeriesRow event="sign_up" letter="B" segment="Unique users" />
        <div className="row items-center gap-2 rounded-md border border-neutral-200 border-dashed px-2 py-1.5 text-[11.5px]">
          <span className="center-center size-4 rounded bg-blue-600 font-mono text-[9px] text-white">
            ƒ
          </span>
          <span className="font-mono">B / A</span>
          <span className="ml-auto text-neutral-500">Sign-up rate</span>
        </div>
      </SidebarSection>
      <SidebarSection title="Global filters">
        <FormInput mono value="country is SE, US, DE" />
      </SidebarSection>
      <SidebarSection title="Breakdown">
        <FormInput value="Country" />
      </SidebarSection>
      <SidebarSection title="Settings">
        <Toggle label="Compare to previous period" on />
        <Toggle label="Hide source series" on />
      </SidebarSection>
    </MockSheet>
  );
}

function ReportHeader({ type = 'Area' }: { type?: string }) {
  return (
    <div className="row items-center gap-2">
      <span className="font-medium text-[13px]">Sign-up rate by country</span>
      <span className="flex-1" />
      <Pill>
        {type}
        <ChevronDownIcon className="size-3 text-neutral-400" />
      </Pill>
      <Pill>
        <Share2Icon className="size-3" />
        Share
      </Pill>
      <Pill active>Save</Pill>
    </div>
  );
}

const SERIES_ROWS = [
  {
    name: 'Sweden',
    unique: '1,204',
    sum: '1,204',
    average: '38.8',
    min: '21',
    max: '61',
  },
  {
    name: 'United States',
    unique: '986',
    sum: '986',
    average: '31.8',
    min: '18',
    max: '52',
  },
  {
    name: 'Germany',
    unique: '612',
    sum: '612',
    average: '19.7',
    min: '9',
    max: '33',
  },
];

function SeriesTable() {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white text-[11.5px]">
      <div className="grid grid-cols-[1.6fr_repeat(5,1fr)] gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>Series</span>
        <span className="text-right">Unique</span>
        <span className="text-right">Sum</span>
        <span className="text-right">Average</span>
        <span className="text-right">Min</span>
        <span className="text-right">Max</span>
      </div>
      {SERIES_ROWS.map((row) => (
        <div
          className="grid grid-cols-[1.6fr_repeat(5,1fr)] gap-x-3 border-neutral-100 border-b px-3 py-1.5 last:border-b-0"
          key={row.name}
        >
          <span className="row items-center gap-2">
            <span className="size-2 rounded-sm bg-blue-600" />
            {row.name}
          </span>
          <span className="text-right font-mono text-neutral-600">
            {row.unique}
          </span>
          <span className="text-right font-mono text-neutral-600">
            {row.sum}
          </span>
          <span className="text-right font-mono text-neutral-600">
            {row.average}
          </span>
          <span className="text-right font-mono text-neutral-600">
            {row.min}
          </span>
          <span className="text-right font-mono text-neutral-600">
            {row.max}
          </span>
        </div>
      ))}
      <div className="row items-center justify-between border-neutral-200 border-t px-3 py-1.5 text-[10.5px] text-neutral-500">
        <span>3 series · 30 days</span>
        <span className="font-medium text-neutral-700">Export CSV</span>
      </div>
    </div>
  );
}

export function ReportEditorContent() {
  return (
    <div className="row items-start gap-3">
      <ReportBuilder />
      <div className="col min-w-0 flex-1 gap-3">
        <ReportHeader />
        <Panel>
          <AreaChart
            labels={LABELS}
            primary={SIGNUPS}
            secondary={SIGNUPS_PREVIOUS}
          />
        </Panel>
        <SeriesTable />
      </div>
    </div>
  );
}

// Small previews of each chart type, behind the open "Available charts" menu.

function PiePreview() {
  return (
    <span
      className="size-14 rounded-full"
      style={{
        background:
          'conic-gradient(#2563eb 0 52%, rgba(37,99,235,0.55) 52% 80%, rgba(37,99,235,0.25) 80% 100%)',
      }}
    />
  );
}

function FunnelPreview() {
  return (
    <div className="row h-14 w-full items-end gap-1">
      {[100, 62, 38, 21].map((share) => (
        <span
          className="flex-1 rounded-t-[2px] bg-blue-600"
          key={share}
          style={{ height: `${share}%` }}
        />
      ))}
    </div>
  );
}

function LinePreview({ dashed = false }: { dashed?: boolean }) {
  return (
    <svg
      className="h-14 w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 40"
    >
      <title>Line</title>
      {dashed && (
        <line
          stroke="#a3a3a3"
          strokeDasharray="3 3"
          x1="0"
          x2="100"
          y1="18"
          y2="18"
        />
      )}
      <path
        d="M0,32 C15,30 20,22 32,24 S50,12 62,14 S85,6 100,4"
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ChartPreview({ type }: { type: (typeof CHART_TYPES)[number] }) {
  switch (type) {
    case 'Linear':
      return <LinePreview />;
    case 'Bar':
      return <BarChart height={56} values={[4, 6, 5, 8, 7, 9]} />;
    case 'Histogram':
      return (
        <BarChart
          height={56}
          secondary={[2, 3, 3, 4, 3, 2]}
          values={[3, 5, 7, 6, 4, 2]}
        />
      );
    case 'Pie':
      return <PiePreview />;
    case 'Metric':
      return (
        <span className="col">
          <span className="font-mono font-semibold text-[22px] leading-none">
            8,634
          </span>
          <span className="font-medium text-[10px] text-emerald-600">
            ↑ 58.6%
          </span>
        </span>
      );
    case 'Area':
      return <AreaChart height={56} primary={[3, 4, 4, 6, 5, 8, 9, 8]} />;
    case 'Map':
      return <MockMap className="h-14" compact />;
    case 'Funnel':
      return <FunnelPreview />;
    case 'Retention':
      return (
        <HeatGrid
          columns={['w0', 'w1', 'w2', 'w3']}
          rowLabel=""
          rows={[
            { label: 'Oct 6', values: [100, 52, 41, 36] },
            { label: 'Oct 13', values: [100, 55, 44] },
            { label: 'Oct 20', values: [100, 57] },
          ]}
          unit=""
        />
      );
    case 'Conversion':
      return <LinePreview dashed />;
    case 'Sankey':
      return (
        <SankeyMock
          columns={JOURNEY_COLUMNS}
          height={56}
          labels={false}
          links={JOURNEY_LINKS}
        />
      );
    default:
      return null;
  }
}

export function ChartTypesContent() {
  return (
    <div className="relative">
      <div className="col gap-3">
        <ReportHeader type="Available charts" />
        <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-3">
          {CHART_TYPES.map((type) => (
            <div
              className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3"
              key={type}
            >
              <span className="font-medium text-[11px] text-neutral-500">
                {type}
              </span>
              <div className="row h-14 items-center">
                <ChartPreview type={type} />
              </div>
            </div>
          ))}
          <div className="col justify-center gap-1 rounded-lg border border-neutral-200 border-dashed p-3 text-[11px] text-neutral-500">
            <span className="font-medium text-neutral-700">
              Eleven chart types
            </span>
            <span>One builder, the same events.</span>
          </div>
        </div>
      </div>
      <div className="col absolute top-9 left-[300px] w-44 rounded-lg border border-neutral-200 bg-white py-1 text-[11.5px] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.3)]">
        <span className="px-3 py-1 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Available charts
        </span>
        {CHART_TYPES.map((type, index) => (
          <span
            className={cn(
              'px-3 py-1',
              index === 5 ? 'bg-neutral-100 font-medium' : 'text-neutral-700'
            )}
            key={type}
          >
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}

// A dashboard: the 24-column grid with tiles of different sizes.

function Tile({
  title,
  range,
  overridden = false,
  children,
  className,
}: {
  title: string;
  range?: string;
  overridden?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col gap-2 rounded-lg border border-neutral-200 bg-white p-3',
        className
      )}
    >
      <div className="row items-center justify-between">
        <span className="font-medium text-[11.5px]">{title}</span>
        <span className="row items-center gap-1.5 text-[10px] text-neutral-500">
          {range && (
            <span className={cn(overridden && 'line-through')}>{range}</span>
          )}
          <MockTabs
            active={0}
            className="gap-2 text-[10px]"
            items={['Chart', 'Table']}
          />
        </span>
      </div>
      {children}
    </div>
  );
}

export function DashboardContent() {
  return (
    <>
      <div className="row items-center gap-2">
        <span className="font-medium text-[13px]">Growth</span>
        <span className="flex-1" />
        <Pill>Search reports...</Pill>
        <Pill>Reset layout</Pill>
        <Pill>
          <Share2Icon className="size-3" />
          Share
        </Pill>
      </div>
      <div className="grid grid-cols-24 gap-3">
        <Tile className="col-span-6" title="Sign-ups">
          <span className="font-mono font-semibold text-[24px] leading-none">
            1,402
          </span>
          <span className="font-medium text-[10px] text-emerald-600">
            ↑ 18.4% vs previous
          </span>
          <BarSpark values={[3, 4, 4, 6, 5, 7, 8, 9]} />
        </Tile>
        <Tile
          className="col-span-18"
          overridden
          range="Last 7 days"
          title="Unique visitors"
        >
          <AreaChart
            height={110}
            labels={LABELS}
            primary={SIGNUPS}
            secondary={SIGNUPS_PREVIOUS}
          />
        </Tile>
        <Tile className="col-span-9" title="Trial to paid">
          <div className="row h-20 items-end gap-2">
            {[
              ['Visited', 100],
              ['Trial', 33],
              ['Project', 22],
              ['Paid', 9.5],
            ].map(([label, share]) => (
              <span className="col flex-1 gap-1" key={String(label)}>
                <span className="col h-14 justify-end rounded bg-neutral-100 p-0.5">
                  <span
                    className="rounded-[2px] bg-blue-600"
                    style={{ height: `${share}%` }}
                  />
                </span>
                <span className="truncate text-[9.5px] text-neutral-500">
                  {label}
                </span>
              </span>
            ))}
          </div>
        </Tile>
        <Tile className="col-span-6" title="Plan">
          <div className="row items-center gap-3">
            <PiePreview />
            <span className="col gap-1 text-[10.5px] text-neutral-600">
              <span>Pro 52%</span>
              <span>Team 28%</span>
              <span>Free 20%</span>
            </span>
          </div>
        </Tile>
        <Tile className="col-span-9" title="Top referrers">
          <div className="col gap-1 text-[11px]">
            {[
              ['Google', 100, '3,331'],
              ['Product Hunt', 38, '1,208'],
              ['X', 24, '771'],
            ].map(([name, share, count]) => (
              <span
                className="row relative items-center justify-between px-1.5 py-1"
                key={String(name)}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded bg-blue-600/8"
                  style={{ width: `${share}%` }}
                />
                <span className="relative">{name}</span>
                <span className="relative font-mono text-neutral-600">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </Tile>
      </div>
    </>
  );
}

export function SankeyContent() {
  return (
    <>
      <div className="row items-center gap-2">
        <span className="font-medium text-[13px]">
          Where people go after /pricing
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-neutral-500">Mode</span>
        <SegmentedControl active={0} items={['After', 'Before', 'Between']} />
        <Pill>
          Steps: 3
          <ChevronDownIcon className="size-3 text-neutral-400" />
        </Pill>
      </div>
      <Panel>
        <SankeyMock
          columns={JOURNEY_COLUMNS}
          height={240}
          links={JOURNEY_LINKS}
        />
      </Panel>
    </>
  );
}

// Minis.

export function MiniFormula() {
  return (
    <div className="col gap-2.5">
      <SeriesRow event="sign_up" letter="A" segment="Unique users" />
      <SeriesRow event="screen_view" letter="B" segment="Unique sessions" />
      <div className="row items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-2 font-mono text-[12px]">
        <span className="text-neutral-500">ƒ</span>
        <span>A / B</span>
        <span className="ml-auto font-semibold">31.4%</span>
      </div>
    </div>
  );
}

export function MiniAiPrompt() {
  return (
    <div className="col gap-2.5">
      <div className="row items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[12px] text-neutral-700 shadow-sm">
        <SparklesIcon className="size-3.5 shrink-0 text-violet-600" />
        <span className="truncate">
          Unique visitors per day for the last 30 days, split by device
        </span>
      </div>
      <div className="row items-center gap-2 text-[11px] text-neutral-500">
        <MockBadge tone="blue">Area</MockBadge>
        <span>Breakdown: Device</span>
      </div>
      <AreaChart
        height={56}
        primary={[4, 5, 5, 7, 6, 8, 9, 8]}
        secondary={[2, 2, 3, 3, 3, 4, 4, 4]}
      />
    </div>
  );
}

export function MiniWidget() {
  return (
    <div className="col items-start gap-3">
      <div className="row items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 shadow-sm">
        <span className="col">
          <span className="font-medium text-[8px] text-neutral-500 uppercase tracking-wider">
            Analytics from
          </span>
          <span className="font-semibold text-[12px]">OpenPanel</span>
        </span>
        <span className="h-7 w-px bg-neutral-200" />
        <span className="col">
          <span className="font-mono font-semibold text-[16px] leading-none">
            8,634
          </span>
          <span className="text-[9px] text-neutral-500">
            visitors · 30 days
          </span>
        </span>
      </div>
      <div className="row items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] shadow-sm">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="font-mono font-semibold">14</span>
        <span className="text-neutral-500">unique visitors</span>
      </div>
    </div>
  );
}

export function MiniTrend() {
  return (
    <div className="col gap-2">
      <div className="row items-center justify-between text-[11px]">
        <span className="font-medium text-neutral-500 uppercase tracking-wider">
          Conversion
        </span>
        <span className="font-mono text-neutral-500">Average 31.4%</span>
      </div>
      <LinePreview dashed />
      <div className="row justify-between text-[10px] text-neutral-500">
        {LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

export const REPORT_MOCKS = {
  'report-editor': {
    content: () => <ReportEditorContent />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 960,
  },
  'chart-types': {
    content: () => <ChartTypesContent />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 900,
  },
  dashboard: {
    content: () => <DashboardContent />,
    shell: { page: 'dashboards', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 900,
  },
  sankey: {
    content: () => <SankeyContent />,
    shell: { page: 'reports', project: 'Acme Web', range: 'Last 30 days' },
    insetWidth: 860,
  },
  'mini-formula': { content: () => <MiniFormula /> },
  'mini-ai-prompt': { content: () => <MiniAiPrompt /> },
  'mini-widget': { content: () => <MiniWidget /> },
  'mini-trend': { content: () => <MiniTrend /> },
} satisfies Record<string, MockDefinition>;
