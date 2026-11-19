import { GlobeIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { Avatar, MockTabs, StatCard, Toggle } from './primitives';
import type { MockDefinition } from './types';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { cn } from '@/lib/utils';

// Revenue where the dashboard shows it: the overview, source and page
// tables, the profile page, and the server-side call that sends it.

const REVENUE = [180, 240, 210, 320, 410, 380, 520, 610];
const VISITORS = [92, 61, 68, 142, 131, 138, 171, 168];

const STATS = [
  {
    label: 'Unique Visitors',
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
    label: 'Revenue',
    value: '$4,210',
    change: '12.1%',
    bars: [3, 4, 4, 6, 5, 8, 9, 7],
    active: true,
  },
];

// Green revenue bars behind the visitors line, the way the overview overlays
// revenue on whichever metric is selected.
function RevenueChart({ height = 150 }: { height?: number }) {
  const width = 600;
  const barMax = Math.max(...REVENUE);
  const lineMax = Math.max(...VISITORS) * 1.1;
  const step = width / REVENUE.length;
  const points = VISITORS.map(
    (value, index) =>
      `${index * step + step / 2},${height - (value / lineMax) * height}`
  );
  return (
    <svg
      className="w-full"
      preserveAspectRatio="none"
      style={{ height }}
      viewBox={`0 0 ${width} ${height}`}
    >
      <title>Revenue</title>
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
      {REVENUE.map((value, index) => {
        const barHeight = (value / barMax) * height * 0.9;
        return (
          <rect
            fill="#059669"
            fillOpacity="0.85"
            height={barHeight}
            key={`${index * step}`}
            rx="3"
            width={step * 0.55}
            x={index * step + step * 0.225}
            y={height - barHeight}
          />
        );
      })}
      <polyline
        fill="none"
        points={points.join(' ')}
        stroke="#2563eb"
        strokeOpacity="0.5"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface RevenueRow {
  name: string;
  sessions: string;
  revenue: string;
  share: number;
}

function SharePie({ share }: { share: number }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 rounded-full"
      style={{ background: `conic-gradient(#059669 ${share}%, #e5e5e5 0)` }}
    />
  );
}

// A sources or pages card with the Revenue column the overview adds when
// a project has revenue.
export function RevenueTable({
  tabs,
  active = 0,
  first,
  rows,
  className,
}: {
  tabs: string[];
  active?: number;
  first: string;
  rows: RevenueRow[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col overflow-hidden rounded-lg border border-neutral-200 bg-white',
        className
      )}
    >
      <div className="border-neutral-200 border-b px-3 pt-3">
        <MockTabs active={active} items={tabs} />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>{first}</span>
        <span className="text-right">Sess.</span>
        <span className="text-right">Revenue</span>
      </div>
      {rows.map((row) => (
        <div
          className="relative grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-[12px]"
          key={row.name}
        >
          <div
            className="absolute inset-y-1 left-1 rounded bg-emerald-600/8"
            style={{ width: `${row.share}%` }}
          />
          <span className="relative truncate">{row.name}</span>
          <span className="relative text-right font-mono text-neutral-600">
            {row.sessions}
          </span>
          <span className="row relative items-center justify-end gap-1.5 font-mono text-emerald-700">
            <SharePie share={row.share} />
            {row.revenue}
          </span>
        </div>
      ))}
    </div>
  );
}

const SOURCES: RevenueRow[] = [
  { name: 'Google', sessions: '2,204', revenue: '$1,640', share: 100 },
  { name: 'Direct / Not set', sessions: '1,480', revenue: '$1,120', share: 68 },
  { name: 'Product Hunt', sessions: '960', revenue: '$780', share: 48 },
  { name: 'X', sessions: '552', revenue: '$410', share: 25 },
  { name: 'LinkedIn', sessions: '349', revenue: '$260', share: 16 },
];

const CAMPAIGNS: RevenueRow[] = [
  { name: 'launch-week', sessions: '1,208', revenue: '$1,980', share: 100 },
  { name: 'newsletter-oct', sessions: '640', revenue: '$860', share: 43 },
  { name: 'retarget-pricing', sessions: '412', revenue: '$720', share: 36 },
  { name: 'partner-dub', sessions: '233', revenue: '$390', share: 20 },
  { name: 'Direct / Not set', sessions: '3,120', revenue: '$260', share: 13 },
];

const ENTRIES: RevenueRow[] = [
  { name: '/pricing', sessions: '1,310', revenue: '$1,870', share: 100 },
  { name: '/', sessions: '3,002', revenue: '$1,240', share: 66 },
  {
    name: '/compare/mixpanel-alternative',
    sessions: '488',
    revenue: '$620',
    share: 33,
  },
  { name: '/docs/sdks/react', sessions: '712', revenue: '$310', share: 17 },
  {
    name: '/articles/mixpanel-pricing',
    sessions: '318',
    revenue: '$170',
    share: 9,
  },
];

export function RevenueOverview() {
  return (
    <>
      <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {STATS.map((stat) => (
          <StatCard
            bars={stat.bars}
            change={stat.change}
            className={cn(
              stat.active &&
                'bg-emerald-50/60 ring-1 ring-emerald-600/30 ring-inset'
            )}
            key={stat.label}
            label={stat.label}
            value={stat.value}
          />
        ))}
      </div>
      <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="row items-center gap-3 text-[11px] text-neutral-600">
          <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
            Revenue
          </span>
          <span className="row items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-600" /> Revenue
          </span>
          <span className="row items-center gap-1.5 text-neutral-400">
            <span className="h-0.5 w-4 rounded bg-blue-600/50" /> Unique
            visitors
          </span>
        </div>
        <RevenueChart />
        <div className="row justify-between text-[11px] text-neutral-500">
          {['Oct 23', 'Oct 25', 'Oct 27', 'Oct 30'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      <div className="grid @2xl:grid-cols-[1.4fr_1fr] grid-cols-1 gap-3">
        <RevenueTable
          first="Referrer"
          rows={SOURCES}
          tabs={['Refs', 'Urls', 'Types', 'Source', 'Medium', 'Campaign']}
        />
        <RevenueTable
          active={1}
          first="Path"
          rows={ENTRIES.slice(0, 5)}
          tabs={['Pages', 'Entries', 'Exits']}
        />
      </div>
    </>
  );
}

export function RevenueSources() {
  return (
    <div className="grid @2xl:grid-cols-2 grid-cols-1 gap-3">
      <RevenueTable
        active={5}
        first="Campaign"
        rows={CAMPAIGNS}
        tabs={['Refs', 'Urls', 'Types', 'Source', 'Medium', 'Campaign']}
      />
      <RevenueTable
        active={1}
        first="Entry page"
        rows={ENTRIES}
        tabs={['Pages', 'Entries', 'Exits']}
      />
    </div>
  );
}

const PROFILE_SESSIONS = [
  {
    when: 'Today 14:02',
    entry: '/settings/billing',
    device: 'desktop',
    events: 9,
    revenue: '$119.00',
  },
  {
    when: 'Oct 27',
    entry: '/docs/sdks/react',
    device: 'desktop',
    events: 22,
    revenue: '',
  },
  {
    when: 'Oct 24',
    entry: '/pricing',
    device: 'mobile',
    events: 6,
    revenue: '$29.00',
  },
  { when: 'Oct 24', entry: '/', device: 'mobile', events: 3, revenue: '' },
];

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'emerald';
}) {
  return (
    <div className="col gap-1 bg-white p-3">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={cn(
          'font-mono font-semibold text-[18px] tracking-tight',
          tone === 'emerald' && 'text-emerald-700'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function RevenueProfile() {
  return (
    <>
      <div className="row items-center gap-3">
        <span className="center-center size-10 rounded-full bg-neutral-100 font-medium text-[12px]">
          AS
        </span>
        <span className="col">
          <span className="font-medium text-[14px]">Ada Svensson</span>
          <span className="row items-center gap-2 text-[11px] text-neutral-500">
            <GlobeIcon className="size-3" /> Sweden · Stockholm · Desktop ·
            macOS · Chrome
          </span>
        </span>
        <span className="row ml-auto gap-2 text-[11.5px]">
          <MockTabs items={['Overview', 'Events', 'Sessions']} />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <Tile label="Total Events" value="412" />
        <Tile label="Sessions" value="12" />
        <Tile label="Conversion Events" value="3" />
        <Tile label="Revenue" tone="emerald" value="$148.00" />
      </div>
      <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid grid-cols-[auto_1.4fr_auto_auto_auto] gap-x-4 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          <span>Started</span>
          <span>Entry page</span>
          <span>Device</span>
          <span className="text-right">Events</span>
          <span className="text-right">Revenue</span>
        </div>
        {PROFILE_SESSIONS.map((session) => (
          <div
            className="grid grid-cols-[auto_1.4fr_auto_auto_auto] items-center gap-x-4 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
            key={session.when + session.entry}
          >
            <span className="text-neutral-600">{session.when}</span>
            <span className="truncate font-mono text-neutral-700">
              {session.entry}
            </span>
            <span className="row items-center gap-1.5 text-neutral-600">
              {session.device === 'mobile' ? (
                <SmartphoneIcon className="size-3 text-neutral-400" />
              ) : (
                <MonitorIcon className="size-3 text-neutral-400" />
              )}
            </span>
            <span className="text-right font-mono">{session.events}</span>
            <span
              className={cn(
                'text-right font-mono',
                session.revenue ? 'text-emerald-700' : 'text-neutral-400'
              )}
            >
              {session.revenue || '-'}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const REVENUE_CODE = [
  { text: '// In your payment webhook, server-side', tone: 'muted' as const },
  { text: "import { OpenPanel } from '@openpanel/sdk';" },
  { text: '' },
  { text: 'const op = new OpenPanel({' },
  { text: '  clientId: process.env.OP_CLIENT_ID,', tone: 'string' as const },
  {
    text: '  clientSecret: process.env.OP_CLIENT_SECRET,',
    tone: 'string' as const,
  },
  { text: '});' },
  { text: '' },
  { text: '// Amount in cents, as an integer', tone: 'muted' as const },
  { text: "await op.revenue(2900, { plan: 'pro' });" },
];

export function RevenueCode() {
  return (
    <div className="grid @2xl:grid-cols-[1.4fr_1fr] grid-cols-1 gap-3">
      <CodeSnippet compact lines={REVENUE_CODE} />
      <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-[12px]">
        <span className="font-medium text-[12.5px]">Project settings</span>
        <div className="row items-start justify-between gap-3">
          <span className="col gap-0.5">
            <span className="text-neutral-800">
              Allow "unsafe" revenue tracking
            </span>
            <span className="text-[11px] text-neutral-500">
              With this enabled, you can track revenue from client code.
            </span>
          </span>
          <Toggle on={false} />
        </div>
        <span className="rounded-md bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-600">
          Off by default: revenue is only accepted with the client secret, so
          nobody can post a fake payment from a browser.
        </span>
      </div>
    </div>
  );
}

// ----- Minis for the cards --------------------------------------------------

export function MiniSessionsRevenue() {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white text-[11.5px]">
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 border-neutral-200 border-b px-2.5 py-1.5 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>User</span>
        <span>Entry</span>
        <span className="text-right">Revenue</span>
      </div>
      {[
        ['AS', '/pricing', '$29.00'],
        ['ML', '/', '-'],
        ['JK', '/compare/posthog', '$99.00'],
      ].map(([initials, entry, revenue]) => (
        <div
          className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 border-neutral-100 border-b px-2.5 py-1.5 last:border-b-0"
          key={initials}
        >
          <Avatar initials={initials} />
          <span className="truncate font-mono text-neutral-600">{entry}</span>
          <span
            className={cn(
              'text-right font-mono',
              revenue === '-' ? 'text-neutral-400' : 'text-emerald-700'
            )}
          >
            {revenue}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MiniProjectCard() {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="row items-center gap-2">
        <span className="center-center size-6 rounded-md bg-blue-600 font-medium text-[10px] text-white">
          A
        </span>
        <span className="font-medium text-[12.5px]">Acme Shop</span>
        <span className="ml-auto text-[10.5px] text-neutral-500">
          Last 7 days
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        {[
          ['Visitors', '8,634'],
          ['Sessions', '9,021'],
          ['Revenue', '$4,210'],
        ].map(([label, value]) => (
          <span className="col" key={label}>
            <span className="text-neutral-500">{label}</span>
            <span
              className={cn(
                'font-mono font-semibold text-[13px]',
                label === 'Revenue' && 'text-emerald-700'
              )}
            >
              {value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniEventRows() {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white text-[11.5px]">
      {[
        ['revenue ($29.00)', 'Ada Svensson', '14:02', true],
        ['screen_view /checkout', 'Ada Svensson', '14:01', false],
        ['revenue ($119.00)', 'Jonas Kim', '13:40', true],
        ['screen_view /pricing', 'Anonymous', '13:38', false],
      ].map(([name, who, time, money]) => (
        <div
          className="row items-center gap-2 border-neutral-100 border-b px-2.5 py-1.5 last:border-b-0"
          key={`${name}-${time}`}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              money ? 'bg-emerald-600' : 'bg-blue-600'
            )}
          />
          <span className={cn('font-mono', money && 'text-emerald-700')}>
            {name}
          </span>
          <span className="ml-auto truncate text-neutral-500">{who}</span>
          <span className="font-mono text-neutral-400">{time}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniSlackPayment() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[11.5px]">
      <div className="row items-center gap-2 text-neutral-500">
        <span className="center-center size-5 rounded bg-neutral-900 font-bold text-[9px] text-white">
          S
        </span>
        <span>#sales</span>
        <span className="ml-auto">now</span>
      </div>
      <span className="font-medium">New payment: $29.00 · Pro plan</span>
      <span className="text-neutral-500">
        Ada Svensson · Stockholm · referrer Product Hunt
      </span>
      <span className="text-[10.5px] text-neutral-400">
        Rule "Payments" · event revenue
      </span>
    </div>
  );
}

export function MiniExportFiles() {
  return (
    <div className="col gap-1 rounded-lg border border-neutral-200 bg-white p-3 font-mono text-[11px]">
      <span className="text-neutral-500">
        s3://acme-analytics/openpanel-exports/
      </span>
      {[
        '2026/10/30/events-2355.jsonl.gz',
        '2026/10/31/events-0000.jsonl.gz',
        '2026/10/31/events-0001.jsonl.gz',
      ].map((file) => (
        <span className="row items-center gap-2 text-neutral-800" key={file}>
          <span className="size-1.5 rounded-full bg-emerald-600" />
          {file}
        </span>
      ))}
      <span className="text-neutral-500">
        every 60 s · revenue in cents on the event
      </span>
    </div>
  );
}

export const REVENUE_MOCKS = {
  'revenue-overview': {
    content: () => <RevenueOverview />,
    shell: { page: 'overview', project: 'Acme Shop' },
    insetWidth: 900,
  },
  'revenue-sources': {
    content: () => <RevenueSources />,
    shell: { page: 'overview', project: 'Acme Shop' },
    insetWidth: 860,
  },
  'revenue-profile': {
    content: () => <RevenueProfile />,
    shell: { page: 'profiles', project: 'Acme Shop' },
    insetWidth: 820,
  },
  'revenue-code': {
    content: () => <RevenueCode />,
    shell: { page: 'settings', project: 'Acme Shop' },
    insetWidth: 860,
  },
  'mini-sessions-revenue': { content: () => <MiniSessionsRevenue /> },
  'mini-project-card': { content: () => <MiniProjectCard /> },
  'mini-event-rows': { content: () => <MiniEventRows /> },
  'mini-slack-payment': { content: () => <MiniSlackPayment /> },
  'mini-export-files': { content: () => <MiniExportFiles /> },
} satisfies Record<string, MockDefinition>;
