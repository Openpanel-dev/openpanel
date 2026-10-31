import {
  Columns3Icon,
  FilterIcon,
  MonitorIcon,
  SearchIcon,
  SmartphoneIcon,
  VideoIcon,
} from 'lucide-react';
import {
  Avatar,
  FilterChip,
  KeyValue,
  MockBadge,
  Panel,
  Pill,
} from './primitives';
import { Timeline } from './primitives-ui';
import { REPLAY_MOCKS } from './sessions-replay';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Sessions list, session detail, session filters and how a session is made.

interface SessionRow {
  started: string;
  id: string;
  replay: boolean;
  user: string;
  name?: string;
  entry: string;
  exit: string;
  duration: string;
  bounce: boolean;
  referrer: string;
  where: string;
  device: 'desktop' | 'mobile';
  events: number;
  revenue?: string;
}

const SESSIONS: SessionRow[] = [
  {
    started: '14:02',
    id: '3f9a1c7e',
    replay: true,
    user: 'AS',
    name: 'Ada Svensson',
    entry: '/pricing',
    exit: '/checkout/done',
    duration: '6m 12s',
    bounce: false,
    referrer: 'Google',
    where: 'Stockholm, SE',
    device: 'desktop',
    events: 14,
    revenue: '$29.00',
  },
  {
    started: '13:58',
    id: 'b81d02aa',
    replay: true,
    user: 'ML',
    entry: '/',
    exit: '/docs/sdks/web',
    duration: '1m 04s',
    bounce: false,
    referrer: 'Product Hunt',
    where: 'Berlin, DE',
    device: 'mobile',
    events: 5,
  },
  {
    started: '13:51',
    id: '9c44e0f1',
    replay: false,
    user: 'JK',
    name: 'Jonas Kahn',
    entry: '/docs/sdks/react',
    exit: '/docs/sdks/react',
    duration: '11m 40s',
    bounce: false,
    referrer: 'Direct',
    where: 'Austin, US',
    device: 'desktop',
    events: 22,
  },
  {
    started: '13:47',
    id: '27ab5d90',
    replay: true,
    user: 'SB',
    entry: '/articles/mixpanel-pricing',
    exit: '/articles/mixpanel-pricing',
    duration: '0m 48s',
    bounce: true,
    referrer: 'X',
    where: 'Lisbon, PT',
    device: 'mobile',
    events: 3,
  },
  {
    started: '13:40',
    id: 'e5c01b38',
    replay: false,
    user: 'TP',
    name: 'Tomoko Park',
    entry: '/compare/posthog-alternative',
    exit: '/pricing',
    duration: '3m 30s',
    bounce: false,
    referrer: 'Google',
    where: 'Tokyo, JP',
    device: 'desktop',
    events: 9,
    revenue: '$9.00',
  },
  {
    started: '13:33',
    id: '71f3d2c6',
    replay: true,
    user: 'RO',
    entry: '/',
    exit: '/',
    duration: '0m 12s',
    bounce: true,
    referrer: 'LinkedIn',
    where: 'Oslo, NO',
    device: 'mobile',
    events: 1,
  },
];

const COLUMNS =
  '46px 90px minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr) 52px 44px 76px 96px 40px 52px';

function HeaderCell({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <span className={cn('truncate', align === 'right' && 'text-right')}>
      {children}
    </span>
  );
}

function SessionLine({ session }: { session: SessionRow }) {
  return (
    <div
      className="grid items-center gap-x-3 border-neutral-100 border-b px-3 py-2 text-[11.5px] last:border-b-0"
      style={{ gridTemplateColumns: COLUMNS }}
    >
      <span className="font-mono text-neutral-500">{session.started}</span>
      <span className="row items-center gap-1.5 font-mono text-neutral-600">
        {session.id}
        {session.replay && (
          <VideoIcon
            aria-label="View replay"
            className="size-3 text-blue-600"
          />
        )}
      </span>
      <span className="row min-w-0 items-center gap-1.5">
        <Avatar initials={session.user} />
        <span className="truncate text-neutral-700">
          {session.name ?? 'Anonymous'}
        </span>
      </span>
      <span className="truncate font-mono text-neutral-700">
        {session.entry}
      </span>
      <span className="truncate font-mono text-neutral-500">
        {session.exit}
      </span>
      <span className="font-mono text-neutral-600">{session.duration}</span>
      <span
        className={cn(
          'font-medium',
          session.bounce ? 'text-amber-600' : 'text-emerald-600'
        )}
      >
        {session.bounce ? 'Yes' : 'No'}
      </span>
      <span className="truncate text-neutral-700">{session.referrer}</span>
      <span className="row items-center gap-1 truncate text-neutral-700">
        {session.device === 'mobile' ? (
          <SmartphoneIcon className="size-3 shrink-0 text-neutral-400" />
        ) : (
          <MonitorIcon className="size-3 shrink-0 text-neutral-400" />
        )}
        <span className="truncate">{session.where}</span>
      </span>
      <span className="text-right font-mono">{session.events}</span>
      <span className="text-right font-mono text-emerald-600">
        {session.revenue ?? <span className="text-neutral-300">-</span>}
      </span>
    </div>
  );
}

export function SessionsTable({ rows = SESSIONS }: { rows?: SessionRow[] }) {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div
        className="grid gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider"
        style={{ gridTemplateColumns: COLUMNS }}
      >
        <HeaderCell>Started</HeaderCell>
        <HeaderCell>Session ID</HeaderCell>
        <HeaderCell>Profile</HeaderCell>
        <HeaderCell>Entry page</HeaderCell>
        <HeaderCell>Exit page</HeaderCell>
        <HeaderCell>Duration</HeaderCell>
        <HeaderCell>Bounce</HeaderCell>
        <HeaderCell>Referrer</HeaderCell>
        <HeaderCell>Location</HeaderCell>
        <HeaderCell align="right">Events</HeaderCell>
        <HeaderCell align="right">Revenue</HeaderCell>
      </div>
      {rows.map((session) => (
        <SessionLine key={session.id} session={session} />
      ))}
    </div>
  );
}

function SessionsToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="row items-center gap-2">
      <span className="row flex-1 items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1.5 text-[12px] text-neutral-500">
        <SearchIcon className="size-3" />
        Search sessions by path, referrer...
      </span>
      <Pill>
        <FilterIcon className="size-3" />
        Session filters
      </Pill>
      <Pill>
        <Columns3Icon className="size-3" />
        Columns
      </Pill>
      {children}
    </div>
  );
}

export function SessionsContent() {
  return (
    <>
      <SessionsToolbar />
      <SessionsTable />
    </>
  );
}

export function SessionsFilteredContent() {
  return (
    <>
      <SessionsToolbar />
      <div className="row flex-wrap items-center gap-1.5">
        <FilterChip field="Entry page" operator="starts with" value="/docs" />
        <FilterChip field="Bounce" value="No" />
        <FilterChip field="Cohort" operator="in" value="Trial users" />
        <FilterChip field="Device" operator="is not" value="mobile" />
      </div>
      <SessionsTable rows={SESSIONS.filter((row) => !row.bounce).slice(0, 4)} />
    </>
  );
}

const SESSION_EVENTS = [
  { label: 'screen_view', detail: '/pricing', time: '14:02:10' },
  { label: 'screen_view', detail: '/pricing#faq', time: '14:03:41' },
  { label: 'started_trial', detail: 'plan: pro', time: '14:04:02' },
  { label: 'screen_view', detail: '/onboarding/connect', time: '14:04:05' },
  {
    label: 'ai_generation',
    detail: 'gpt-4.1 · 1,204 tokens · $0.004',
    time: '14:05:30',
  },
  { label: 'screen_view', detail: '/checkout', time: '14:07:12' },
  { label: 'purchase', detail: 'Pro plan · $29.00', time: '14:08:19' },
  { label: 'screen_view', detail: '/checkout/done', time: '14:08:22' },
];

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((row) => row.value));
  return (
    <div className="col gap-1.5">
      {rows.map((row) => (
        <div
          className="row relative items-center justify-between text-[11px]"
          key={row.label}
        >
          <div
            className="absolute inset-y-0 left-0 rounded bg-blue-600/8"
            style={{ width: `${(row.value / max) * 100}%` }}
          />
          <span className="relative truncate px-1.5 py-0.5 font-mono">
            {row.label}
          </span>
          <span className="relative px-1.5 font-mono text-neutral-600">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SessionDetailContent() {
  return (
    <>
      <div className="row flex-wrap items-center gap-2">
        <span className="font-medium text-[13px]">Session: 3f9a1c7e</span>
        <MockBadge>SE · Stockholm</MockBadge>
        <MockBadge>Desktop</MockBadge>
        <MockBadge>macOS</MockBadge>
        <MockBadge>Chrome 128</MockBadge>
        <span className="flex-1" />
        <Pill>
          <VideoIcon className="size-3 text-blue-600" />
          View replay
        </Pill>
      </div>
      <div className="grid @2xl:grid-cols-[300px_1fr] grid-cols-1 gap-3">
        <div className="col gap-3">
          <Panel title="Session info">
            <KeyValue
              items={[
                { key: 'duration', value: '6m 12s' },
                { key: 'entryPath', value: '/pricing' },
                { key: 'exitPath', value: '/checkout/done' },
                { key: 'referrerName', value: 'Google' },
                { key: 'utmCampaign', value: 'launch' },
                { key: 'revenue', value: '$29.00' },
                { key: 'country', value: 'SE' },
                { key: 'city', value: 'Stockholm' },
                { key: 'os', value: 'macOS' },
                { key: 'browser', value: 'Chrome' },
              ]}
            />
          </Panel>
          <Panel title="Profile">
            <div className="row items-center gap-2 text-[12px]">
              <Avatar initials="AS" />
              <span className="col">
                <span className="font-medium">Ada Svensson</span>
                <span className="text-[11px] text-neutral-500">
                  ada@acme.io
                </span>
              </span>
            </div>
          </Panel>
          <Panel title="Visited pages">
            <BarList
              rows={[
                { label: '/pricing', value: 2 },
                { label: '/checkout', value: 1 },
                { label: '/onboarding/connect', value: 1 },
                { label: '/checkout/done', value: 1 },
              ]}
            />
          </Panel>
          <Panel title="Event distribution">
            <BarList
              rows={[
                { label: 'screen_view', value: 5 },
                { label: 'started_trial', value: 1 },
                { label: 'purchase', value: 1 },
                { label: 'ai_generation', value: 1 },
              ]}
            />
          </Panel>
        </div>
        <Panel padded={false} title="Events">
          <Timeline className="pt-1" items={SESSION_EVENTS} />
        </Panel>
      </div>
    </>
  );
}

function Piece({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'blue' | 'dark';
}) {
  return (
    <span
      className={cn(
        'rounded-md px-2.5 py-1.5 font-mono text-[11.5px]',
        tone === 'neutral' && 'bg-neutral-100 text-neutral-700',
        tone === 'blue' && 'bg-blue-50 text-blue-700',
        tone === 'dark' && 'bg-neutral-900 text-white'
      )}
    >
      {children}
    </span>
  );
}

// How a session is made without a cookie: the device id recipe and the
// 30 minute rule, drawn with the dashboard's own pieces.
export function SessionIdentityContent() {
  const minutes = ['14:02', '14:08', '14:21', '14:30', '15:04'];
  return (
    <>
      <Panel title="Device id · no cookie, no localStorage">
        <div className="row flex-wrap items-center gap-2 text-[12px] text-neutral-400">
          <Piece>user agent</Piece>+<Piece>ip</Piece>+<Piece>origin</Piece>+
          <Piece tone="blue">salt · rotates 00:00 UTC</Piece>
          <span className="px-1">→ sha256 →</span>
          <Piece tone="dark">device 7f3a…c91e</Piece>
        </div>
      </Panel>
      <Panel title="Session · ends after 30 quiet minutes">
        <div className="col gap-2">
          <div className="row items-center gap-1.5">
            <MockBadge tone="emerald">session_start · server</MockBadge>
            {minutes.slice(0, 4).map((minute) => (
              <span className="row items-center gap-1.5" key={minute}>
                <span className="h-px w-5 bg-neutral-200" />
                <span className="rounded bg-blue-600/10 px-1.5 py-0.5 font-mono text-[10.5px] text-blue-900">
                  {minute}
                </span>
              </span>
            ))}
            <span className="h-px w-8 border-neutral-300 border-t border-dashed" />
            <span className="font-mono text-[10.5px] text-neutral-400">
              +30 min
            </span>
            <MockBadge tone="neutral">session_end · server</MockBadge>
          </div>
          <div className="row items-center gap-1.5 opacity-70">
            <MockBadge tone="emerald">session_start · server</MockBadge>
            <span className="h-px w-5 bg-neutral-200" />
            <span className="rounded bg-blue-600/10 px-1.5 py-0.5 font-mono text-[10.5px] text-blue-900">
              {minutes[4]}
            </span>
            <span className="text-[11px] text-neutral-500">a new visit</span>
          </div>
        </div>
      </Panel>
    </>
  );
}

// Minis for the capability cards.

export function MiniPageBars() {
  return (
    <div className="col gap-3">
      <div className="col gap-1">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Visited pages
        </span>
        <BarList
          rows={[
            { label: '/pricing', value: 2 },
            { label: '/checkout', value: 1 },
            { label: '/checkout/done', value: 1 },
          ]}
        />
      </div>
      <div className="col gap-1">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Event distribution
        </span>
        <BarList
          rows={[
            { label: 'screen_view', value: 5 },
            { label: 'purchase', value: 1 },
          ]}
        />
      </div>
    </div>
  );
}

const PICKABLE_COLUMNS = [
  ['Started', true],
  ['Session ID', true],
  ['Profile', true],
  ['Entry Page', true],
  ['Exit Page', false],
  ['Duration', true],
  ['Bounce', false],
  ['Referrer', true],
  ['Revenue', true],
  ['Device ID', false],
] as const;

export function MiniColumnPicker() {
  return (
    <div className="col gap-1 rounded-lg border border-neutral-200 bg-white p-2 text-[11.5px]">
      {PICKABLE_COLUMNS.slice(0, 7).map(([label, on]) => (
        <span className="row items-center gap-2 px-1" key={label}>
          <span
            className={cn(
              'center-center size-3.5 rounded border',
              on ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-300'
            )}
          >
            {on && <span className="size-1.5 rounded-sm bg-white" />}
          </span>
          <span className={on ? '' : 'text-neutral-400'}>{label}</span>
        </span>
      ))}
    </div>
  );
}

export function MiniSessionSearch() {
  return (
    <div className="col gap-2">
      <span className="row items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1.5 text-[12px]">
        <SearchIcon className="size-3 text-neutral-400" />
        <span className="font-mono">/docs</span>
        <span className="h-3.5 w-px bg-neutral-900" />
      </span>
      <div className="col gap-1 text-[11.5px]">
        {['/docs/sdks/web', '/docs/sdks/react', '/docs/self-hosting'].map(
          (path) => (
            <span
              className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1"
              key={path}
            >
              <span className="font-mono text-neutral-700">{path}</span>
              <span className="ml-auto font-mono text-neutral-400">
                {
                  ['14:02', '13:51', '13:40'][
                    [
                      '/docs/sdks/web',
                      '/docs/sdks/react',
                      '/docs/self-hosting',
                    ].indexOf(path)
                  ]
                }
              </span>
            </span>
          )
        )}
      </div>
    </div>
  );
}

export const SESSION_MOCKS = {
  sessions: {
    content: () => <SessionsContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 940,
  },
  'session-detail': {
    content: () => <SessionDetailContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 900,
  },
  'sessions-filtered': {
    content: () => <SessionsFilteredContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 940,
  },
  'session-identity': {
    content: () => <SessionIdentityContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 820,
  },
  'mini-page-bars': { content: () => <MiniPageBars /> },
  'mini-column-picker': { content: () => <MiniColumnPicker /> },
  'mini-session-search': { content: () => <MiniSessionSearch /> },
  ...REPLAY_MOCKS,
} satisfies Record<string, MockDefinition>;
