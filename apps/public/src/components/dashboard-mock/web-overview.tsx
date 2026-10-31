import {
  ChevronDownIcon,
  GlobeIcon,
  LockIcon,
  SparklesIcon,
} from 'lucide-react';
import { INDEX_MOCKS } from './index-minis';
import {
  AreaChart,
  FilterChip,
  MockTable,
  MockTabs,
  Panel,
  StatCard,
} from './primitives';
import { JOURNEY_COLUMNS, JOURNEY_LINKS, SankeyMock } from './sankey';
import type { MockDefinition } from './types';
import { MockMap, REALTIME_MOCKS } from './web-realtime';
import { cn } from '@/lib/utils';

// The web analytics overview and the pieces cut out of it.

const VISITORS = [92, 61, 68, 142, 131, 138, 171, 168];
const VISITORS_PREVIOUS = [4, 6, 38, 60, 120, 128, 126, 110];
const CHART_LABELS = ['Oct 23', 'Oct 25', 'Oct 27', 'Oct 30'];

type Stat = React.ComponentProps<typeof StatCard>;

const STATS: Stat[] = [
  {
    label: 'Unique visitors',
    value: '8,634',
    change: '58.6%',
    bars: [5, 3, 4, 7, 7, 9, 9, 6],
  },
  {
    label: 'Sessions',
    value: '9,021',
    change: '43.9%',
    bars: [4, 3, 3, 7, 7, 9, 8, 5],
  },
  {
    label: 'Pageviews',
    value: '13,240',
    change: '36.6%',
    bars: [4, 3, 3, 6, 7, 9, 8, 5],
  },
  {
    label: 'Pages per session',
    value: '1.47',
    change: '5.2%',
    negative: true,
    bars: [7, 8, 8, 8, 8, 8, 7, 8],
  },
  {
    label: 'Bounce rate',
    value: '65.5',
    unit: '%',
    change: '9.8%',
    negative: true,
    bars: [6, 7, 5, 6, 6, 6, 7, 7],
  },
  {
    label: 'Session duration',
    value: '1m 0s',
    change: '4.7%',
    negative: true,
    bars: [5, 6, 6, 8, 6, 7, 7, 8],
  },
  {
    label: 'Revenue',
    value: '$4,210',
    change: '12.1%',
    bars: [3, 4, 4, 6, 5, 8, 9, 7],
  },
];

const FILTERED_STATS: Stat[] = [
  {
    label: 'Unique visitors',
    value: '1,208',
    change: '112%',
    bars: [2, 2, 3, 5, 6, 8, 9, 7],
  },
  {
    label: 'Sessions',
    value: '1,371',
    change: '98.4%',
    bars: [2, 2, 3, 5, 6, 8, 8, 6],
  },
  {
    label: 'Pageviews',
    value: '2,906',
    change: '87.1%',
    bars: [2, 3, 3, 5, 7, 9, 8, 6],
  },
  {
    label: 'Bounce rate',
    value: '41.2',
    unit: '%',
    change: '6.1%',
    bars: [6, 6, 5, 5, 5, 4, 4, 4],
  },
];

const LIVE_MINUTES = [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8];

function LiveCell() {
  return (
    <div className="col gap-2 bg-white p-3.5">
      <div className="row items-center justify-between">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Last 30 min
        </span>
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      </div>
      <span className="font-mono font-semibold text-[22px] tabular-nums leading-none tracking-tight">
        14
      </span>
      <span className="text-[11px] text-neutral-500">unique visitors</span>
      <div className="row h-6 items-end gap-0.5">
        {LIVE_MINUTES.map((value, index) => (
          <span
            className="flex-1 rounded-[1px] bg-emerald-500/70"
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
            key={index}
            style={{ height: `${(value / 8) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function StatStrip({ stats, live = true }: { stats: Stat[]; live?: boolean }) {
  return (
    <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
      {live && <LiveCell />}
    </div>
  );
}

const SOURCE_TABS = [
  'Refs',
  'Urls',
  'Types',
  'Source',
  'Medium',
  'Campaign',
  'Term',
  'Content',
];
const PAGE_TABS = ['Pages', 'Entries', 'Exits'];
const DEVICE_TABS = [
  'Devices',
  'Browser',
  'Browser Version',
  'OS',
  'OS version',
  'Brands',
  'Models',
];
const GEO_TABS = ['Countries', 'Regions', 'Cities', 'Map'];

const REFERRERS = [
  { cells: ['Google', '3,331', '2,204'], share: 100 },
  { cells: ['Direct / Not set', '2,104', '1,480'], share: 64 },
  { cells: ['Product Hunt', '1,208', '960'], share: 38 },
  { cells: ['X', '771', '552'], share: 24 },
  { cells: ['LinkedIn', '478', '349'], share: 15 },
];

const CAMPAIGNS = [
  { cells: ['launch_week', '1,412', '1,090'], share: 100 },
  { cells: ['newsletter_oct', '904', '720'], share: 64 },
  { cells: ['ph_launch', '611', '480'], share: 43 },
  { cells: ['docs_footer', '233', '201'], share: 17 },
  { cells: ['Direct / Not set', '2,104', '1,480'], share: 10 },
];

const PAGES = [
  { cells: ['/', '4,120', '3,002'], share: 100 },
  { cells: ['/pricing', '1,870', '1,310'], share: 45 },
  { cells: ['/docs/guides/cohorts', '933', '712'], share: 23 },
  { cells: ['/docs/guides/funnels', '611', '480'], share: 15 },
  { cells: ['/articles', '402', '318'], share: 10 },
];

const ENTRIES = [
  { cells: ['/', '3,002', '41%'], share: 100 },
  { cells: ['/articles/mixpanel-pricing', '1,104', '68%'], share: 37 },
  { cells: ['/pricing', '812', '52%'], share: 27 },
  { cells: ['/compare/posthog-alternative', '540', '59%'], share: 18 },
  { cells: ['/docs/sdks/react', '366', '31%'], share: 12 },
];

const DEVICES = [
  { cells: ['Desktop', '5,820', '67%'], share: 100 },
  { cells: ['Mobile', '2,511', '29%'], share: 43 },
  { cells: ['Tablet', '303', '4%'], share: 5 },
];

const COUNTRIES = [
  { cells: ['Sweden', '2,104', '24%'], share: 100 },
  { cells: ['United States', '1,866', '22%'], share: 89 },
  { cells: ['Germany', '1,021', '12%'], share: 49 },
  { cells: ['United Kingdom', '744', '9%'], share: 35 },
];

// MockTable with a chosen active tab, as the overview widgets show them.
function WidgetTable({
  tabs,
  active = 0,
  columns,
  rows,
}: {
  tabs: string[];
  active?: number;
  columns: string[];
  rows: { cells: React.ReactNode[]; share?: number }[];
}) {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="overflow-hidden border-neutral-200 border-b px-3 pt-3">
        <MockTabs active={active} className="whitespace-nowrap" items={tabs} />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        {columns.map((column, index) => (
          <span className={cn(index > 0 && 'text-right')} key={column}>
            {column}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          className="relative grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-[12px]"
          key={String(row.cells[0])}
        >
          {row.share !== undefined && (
            <div
              className="absolute inset-y-1 left-1 rounded bg-blue-600/8"
              style={{ width: `${row.share}%` }}
            />
          )}
          {row.cells.map((cell, index) => (
            <span
              className={cn(
                'relative truncate',
                index > 0 && 'text-right font-mono text-neutral-600'
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: static cells
              key={index}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function SourcesAndPages({ campaign = false }: { campaign?: boolean }) {
  return (
    <div className="grid @2xl:grid-cols-[1.4fr_1fr] grid-cols-1 gap-3">
      <WidgetTable
        active={campaign ? 5 : 0}
        columns={[campaign ? 'Campaign' : 'Referrer', 'Views', 'Sess.']}
        rows={campaign ? CAMPAIGNS : REFERRERS}
        tabs={SOURCE_TABS}
      />
      <WidgetTable
        active={campaign ? 1 : 0}
        columns={
          campaign
            ? ['Entry page', 'Sess.', 'Bounce']
            : ['Path', 'Views', 'Sess.']
        }
        rows={campaign ? ENTRIES : PAGES}
        tabs={PAGE_TABS}
      />
    </div>
  );
}

function DevicesAndGeo() {
  return (
    <div className="grid @2xl:grid-cols-[1fr_1fr_1.2fr] grid-cols-1 gap-3">
      <WidgetTable
        columns={['Device', 'Visitors', 'Share']}
        rows={DEVICES}
        tabs={DEVICE_TABS.slice(0, 4)}
      />
      <WidgetTable
        columns={['Country', 'Visitors', 'Share']}
        rows={COUNTRIES}
        tabs={GEO_TABS}
      />
      <Panel title="Map">
        <MockMap className="max-h-32" compact />
      </Panel>
    </div>
  );
}

function SpikeMarker() {
  return (
    <span className="col absolute top-1 left-[46%] -translate-x-1/2 items-center gap-0.5">
      <span className="center-center size-4 rounded-full bg-white ring-1 ring-black/10">
        <GlobeIcon className="size-2.5 text-neutral-600" />
      </span>
      <span className="h-[86px] w-px border-neutral-400 border-l border-dashed" />
    </span>
  );
}

export function WebOverviewContent({
  spike = false,
  campaign = false,
}: {
  spike?: boolean;
  campaign?: boolean;
}) {
  return (
    <>
      <StatStrip stats={STATS} />
      <Panel title="Unique visitors">
        <div className="relative">
          {spike && <SpikeMarker />}
          <AreaChart
            labels={CHART_LABELS}
            primary={VISITORS}
            secondary={VISITORS_PREVIOUS}
          />
        </div>
      </Panel>
      <SourcesAndPages campaign={campaign} />
      <DevicesAndGeo />
    </>
  );
}

// The overview after clicking two values: the chips, and the numbers for
// that slice only.
export function WebFilteredContent() {
  return (
    <>
      <div className="row flex-wrap items-center gap-2">
        <FilterChip field="Referrer" value="Product Hunt" />
        <FilterChip field="Country" value="Sweden" />
        <span className="text-[11px] text-neutral-500">
          Click any value to add a filter
        </span>
      </div>
      <StatStrip live={false} stats={FILTERED_STATS} />
      <Panel title="Unique visitors · Product Hunt · Sweden">
        <AreaChart
          labels={CHART_LABELS}
          primary={[12, 9, 14, 61, 48, 44, 39, 36]}
          secondary={[2, 3, 3, 4, 6, 5, 7, 6]}
        />
      </Panel>
      <SourcesAndPages />
    </>
  );
}

// Sources on the Campaign tab, entry pages, and a referrer spike on the chart.
export function WebSourcesContent() {
  return (
    <>
      <Panel title="Unique visitors">
        <div className="relative">
          <SpikeMarker />
          <AreaChart
            labels={CHART_LABELS}
            primary={VISITORS}
            secondary={VISITORS_PREVIOUS}
          />
        </div>
      </Panel>
      <SourcesAndPages campaign />
    </>
  );
}

// Search Console data on the Pages screen.
const CLICKS = [120, 132, 128, 150, 162, 158, 181, 190];
const IMPRESSIONS = [2200, 2400, 2350, 2600, 2900, 2800, 3100, 3300];

export function SeoContent() {
  return (
    <>
      <MockTabs active={1} items={['Pages', 'Search Console', 'Entries']} />
      <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <StatCard
          bars={[4, 4, 5, 6, 6, 7, 8, 9]}
          change="18.2%"
          label="Clicks"
          value="1,221"
        />
        <StatCard
          bars={[5, 5, 5, 6, 7, 7, 8, 9]}
          change="22.4%"
          label="Impressions"
          value="19.6K"
        />
        <StatCard
          bars={[6, 6, 6, 6, 6, 6, 6, 6]}
          change="1.1%"
          label="Avg CTR"
          unit="%"
          value="6.2"
        />
        <StatCard
          bars={[7, 7, 6, 6, 6, 5, 5, 5]}
          change="0.8"
          label="Avg position"
          value="8.4"
        />
      </div>
      <div className="grid @2xl:grid-cols-[1.3fr_1fr] grid-cols-1 gap-3">
        <Panel title="Clicks and impressions">
          <AreaChart
            height={120}
            labels={CHART_LABELS}
            primary={CLICKS}
            secondary={IMPRESSIONS.map((value) => value / 18)}
          />
        </Panel>
        <MockTable
          columns={['Query', 'Clicks', 'Pos.']}
          rows={[
            { cells: ['mixpanel alternative', '312', '1.0'], share: 100 },
            { cells: ['open source analytics', '198', '3.2'], share: 63 },
            { cells: ['cookieless analytics', '84', '4.1'], share: 27 },
            { cells: ['self hosted analytics', '71', '5.6'], share: 23 },
            { cells: ['posthog alternative', '56', '7.0'], share: 18 },
          ]}
          title="Top queries"
        />
      </div>
      <div className="grid @2xl:grid-cols-[1fr_1fr] grid-cols-1 gap-3">
        <MockTable
          columns={['Referrer', 'Sessions', 'Share']}
          rows={[
            { cells: ['ChatGPT', '214', '58%'], share: 100 },
            { cells: ['Perplexity', '96', '26%'], share: 45 },
            { cells: ['Claude', '41', '11%'], share: 19 },
            { cells: ['Gemini', '18', '5%'], share: 8 },
          ]}
          title="AI referrals"
        />
        <MockTable
          columns={['Page', 'Why', 'Pos.']}
          rows={[
            {
              cells: ['/articles/mixpanel-pricing', 'Low CTR', '4.2'],
              share: 100,
            },
            {
              cells: ['/compare/plausible-alternative', 'Near page 1', '11.3'],
              share: 70,
            },
            {
              cells: ['/docs/sdks/nextjs', 'Low visibility', '18.0'],
              share: 40,
            },
            { cells: ['/pricing', 'High bounce', '2.1'], share: 30 },
          ]}
          title="Opportunities"
        />
      </div>
    </>
  );
}

// Minis for feature cards.

export function MiniDevices() {
  return (
    <div className="col gap-2">
      <MockTabs active={0} items={['Devices', 'Browser', 'OS']} />
      <div className="col gap-1.5 text-[11.5px]">
        {DEVICES.map((row) => (
          <div
            className="row relative items-center justify-between px-2 py-1"
            key={String(row.cells[0])}
          >
            <span
              className="absolute inset-y-0 left-0 rounded bg-blue-600/8"
              style={{ width: `${row.share}%` }}
            />
            <span className="relative">{row.cells[0]}</span>
            <span className="relative font-mono text-neutral-600">
              {row.cells[1]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HEAT = [
  [1, 2, 4, 7, 8, 7, 6, 8, 7, 5, 3, 2],
  [1, 2, 4, 8, 9, 8, 6, 8, 8, 5, 3, 2],
  [1, 2, 5, 8, 9, 8, 7, 9, 8, 6, 3, 2],
  [1, 2, 4, 7, 8, 8, 6, 8, 7, 5, 3, 2],
  [1, 2, 4, 6, 7, 6, 5, 6, 5, 4, 3, 2],
  [1, 1, 2, 3, 4, 4, 4, 4, 4, 3, 2, 1],
  [1, 1, 2, 3, 4, 4, 4, 5, 4, 3, 2, 1],
];

export function MiniHeatmap() {
  return (
    <div className="col gap-2">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        Weekly trends · Unique visitors
      </span>
      <div className="grid grid-cols-[28px_repeat(12,minmax(0,1fr))] gap-0.5">
        {HEAT.map((row, dayIndex) => (
          <div className="contents" key={WEEKDAYS[dayIndex]}>
            <span className="text-[9px] text-neutral-500">
              {WEEKDAYS[dayIndex]}
            </span>
            {row.map((value, hour) => (
              <span
                className="h-3 rounded-[2px]"
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed hour columns
                key={hour}
                style={{
                  backgroundColor: `rgba(37, 99, 235, ${0.06 + (value / 9) * 0.6})`,
                }}
              />
            ))}
          </div>
        ))}
        <span />
        {['0', '4', '8', '12', '16', '20'].map((hour) => (
          <span className="col-span-2 text-[9px] text-neutral-400" key={hour}>
            {hour}h
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniSankey() {
  return (
    <div className="col gap-2">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        User journey
      </span>
      <SankeyMock
        columns={JOURNEY_COLUMNS}
        height={150}
        links={JOURNEY_LINKS}
      />
    </div>
  );
}

export function MiniShareToggle({ open = true }: { open?: boolean }) {
  return (
    <div className="col gap-3">
      <div className="row items-center justify-between">
        <span className="row items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px]">
          <SparklesIcon className="size-3 text-neutral-500" />
          Share
          <ChevronDownIcon className="size-3 text-neutral-400" />
        </span>
        <span
          className={cn(
            'rounded-md px-2 py-1 font-medium text-[11px]',
            open
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-neutral-100 text-neutral-600'
          )}
        >
          {open ? 'Public' : 'Private'}
        </span>
      </div>
      <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px] shadow-sm">
        <span className="font-medium">Overview public availability</span>
        <span className="row items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 font-mono text-[11px] text-neutral-600">
          <LockIcon className="size-3 text-neutral-400" />
          Enter a password (optional)
        </span>
        <span className="truncate font-mono text-[11px] text-blue-700">
          openpanel.dev/share/overview/8f3k2…
        </span>
      </div>
    </div>
  );
}

export const WEB_MOCKS = {
  'web-overview': {
    content: () => <WebOverviewContent />,
    shell: { page: 'overview', project: 'Acme Web' },
    insetWidth: 900,
  },
  'web-filtered': {
    content: () => <WebFilteredContent />,
    shell: { page: 'overview', project: 'Acme Web' },
    insetWidth: 900,
  },
  'web-sources': {
    content: () => <WebSourcesContent />,
    shell: { page: 'overview', project: 'Acme Web', range: 'Last 30 days' },
    insetWidth: 900,
  },
  seo: {
    content: () => <SeoContent />,
    shell: { page: 'pages', project: 'Acme Web' },
    insetWidth: 900,
  },
  ...REALTIME_MOCKS,
  ...INDEX_MOCKS,
  'mini-devices': { content: () => <MiniDevices /> },
  'mini-heatmap': { content: () => <MiniHeatmap /> },
  'mini-sankey': { content: () => <MiniSankey /> },
  'mini-share-toggle': { content: () => <MiniShareToggle /> },
} satisfies Record<string, MockDefinition>;
