import {
  CalendarIcon,
  CheckIcon,
  Columns3Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  EyeIcon,
  FilterIcon,
  MousePointerClickIcon,
  SparklesIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  AreaChart,
  Avatar,
  KeyValue,
  MockBadge,
  MockTabs,
  Panel,
  Pill,
} from './primitives';
import { MockModal, MockSheet, SegmentedControl } from './primitives-ui';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Events list with the live badge, the event drawer and event settings.

type EventKind = 'view' | 'click' | 'signup' | 'purchase' | 'ai' | 'link';

interface EventRow {
  time: string;
  name: string;
  detail?: string;
  kind: EventKind;
  user: string;
  session: string;
  country: string;
  os: string;
  browser: string;
  props: number;
}

const ICONS: Record<EventKind, React.ReactNode> = {
  view: <EyeIcon className="size-3" />,
  click: <MousePointerClickIcon className="size-3" />,
  signup: <UserPlusIcon className="size-3" />,
  purchase: <CreditCardIcon className="size-3" />,
  ai: <SparklesIcon className="size-3" />,
  link: <ExternalLinkIcon className="size-3" />,
};

const ICON_TONES: Record<EventKind, string> = {
  view: 'bg-neutral-100 text-neutral-600',
  click: 'bg-neutral-100 text-neutral-600',
  signup: 'bg-emerald-50 text-emerald-700',
  purchase: 'bg-blue-50 text-blue-700',
  ai: 'bg-violet-50 text-violet-700',
  link: 'bg-neutral-100 text-neutral-600',
};

const EVENTS: EventRow[] = [
  {
    time: '14:08:19',
    name: 'purchase',
    detail: 'revenue ($29.00)',
    kind: 'purchase',
    user: 'Ada Svensson',
    session: '3f9a1c7e',
    country: 'SE',
    os: 'macOS',
    browser: 'Chrome',
    props: 4,
  },
  {
    time: '14:08:12',
    name: 'screen_view',
    detail: '/checkout',
    kind: 'view',
    user: 'Ada Svensson',
    session: '3f9a1c7e',
    country: 'SE',
    os: 'macOS',
    browser: 'Chrome',
    props: 3,
  },
  {
    time: '14:07:55',
    name: 'ai_generation',
    detail: 'gpt-4.1',
    kind: 'ai',
    user: 'Jonas Kahn',
    session: '9c44e0f1',
    country: 'US',
    os: 'Windows',
    browser: 'Edge',
    props: 9,
  },
  {
    time: '14:07:40',
    name: 'link_out',
    detail: 'github.com/openpanel-dev',
    kind: 'link',
    user: 'Anonymous',
    session: 'b81d02aa',
    country: 'DE',
    os: 'iOS',
    browser: 'Safari',
    props: 2,
  },
  {
    time: '14:07:02',
    name: 'sign_up',
    detail: 'email',
    kind: 'signup',
    user: 'Tomoko Park',
    session: 'e5c01b38',
    country: 'JP',
    os: 'macOS',
    browser: 'Chrome',
    props: 2,
  },
  {
    time: '14:06:48',
    name: 'screen_view',
    detail: '/pricing',
    kind: 'view',
    user: 'Anonymous',
    session: '27ab5d90',
    country: 'PT',
    os: 'Android',
    browser: 'Chrome',
    props: 3,
  },
  {
    time: '14:06:31',
    name: 'copy_snippet',
    detail: 'framework: nextjs',
    kind: 'click',
    user: 'Jonas Kahn',
    session: '9c44e0f1',
    country: 'US',
    os: 'Windows',
    browser: 'Edge',
    props: 1,
  },
  {
    time: '14:06:10',
    name: 'screen_view',
    detail: '/docs/sdks/web',
    kind: 'view',
    user: 'Anonymous',
    session: 'b81d02aa',
    country: 'DE',
    os: 'iOS',
    browser: 'Safari',
    props: 3,
  },
];

const EVENT_COLUMNS =
  '64px minmax(0,1.6fr) minmax(0,1fr) 70px 36px 62px 60px 64px';

function EventIcon({ kind }: { kind: EventKind }) {
  return (
    <span
      className={cn(
        'center-center size-5 shrink-0 rounded-md',
        ICON_TONES[kind]
      )}
    >
      {ICONS[kind]}
    </span>
  );
}

function EventLine({
  event,
  fresh = false,
}: {
  event: EventRow;
  fresh?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-x-3 border-neutral-100 border-b px-3 py-1.5 text-[11.5px] last:border-b-0',
        fresh && 'bg-emerald-50/60'
      )}
      style={{ gridTemplateColumns: EVENT_COLUMNS }}
    >
      <span className="font-mono text-neutral-500">{event.time}</span>
      <span className="row min-w-0 items-center gap-2">
        <EventIcon kind={event.kind} />
        <span className="truncate font-mono">{event.name}</span>
        {event.detail && (
          <span className="truncate font-mono text-neutral-500">
            {event.detail}
          </span>
        )}
      </span>
      <span className="row min-w-0 items-center gap-1.5">
        <Avatar
          initials={
            event.user === 'Anonymous'
              ? '?'
              : event.user
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
          }
        />
        <span
          className={cn(
            'truncate',
            event.user === 'Anonymous' && 'text-neutral-400'
          )}
        >
          {event.user}
        </span>
      </span>
      <span className="font-mono text-neutral-500">{event.session}</span>
      <span className="font-mono text-neutral-600">{event.country}</span>
      <span className="truncate text-neutral-700">{event.os}</span>
      <span className="truncate text-neutral-700">{event.browser}</span>
      <span className="text-right">
        <MockBadge className="whitespace-nowrap">{event.props} props</MockBadge>
      </span>
    </div>
  );
}

function LiveBadge({ fresh }: { fresh: number }) {
  return (
    <span
      className={cn(
        'row items-center gap-1.5 rounded-md px-2 py-1 font-medium text-[11.5px]',
        fresh > 0
          ? 'bg-emerald-600 text-white'
          : 'bg-emerald-50 text-emerald-700'
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {fresh > 0 ? `${fresh} new events` : 'Listening'}
    </span>
  );
}

function EventsTable({
  fresh = 0,
  rows = EVENTS,
}: {
  fresh?: number;
  rows?: EventRow[];
}) {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div
        className="grid gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider"
        style={{ gridTemplateColumns: EVENT_COLUMNS }}
      >
        <span>Created at</span>
        <span>Name</span>
        <span>Profile</span>
        <span>Session ID</span>
        <span>Ctry</span>
        <span>OS</span>
        <span>Browser</span>
        <span className="text-right">Props</span>
      </div>
      {rows.map((event, index) => (
        <EventLine
          event={event}
          fresh={index < fresh}
          key={`${event.time}-${event.name}`}
        />
      ))}
    </div>
  );
}

function EventsToolbar({ fresh = 0 }: { fresh?: number }) {
  return (
    <>
      <MockTabs items={['Events', 'Conversions', 'Stats']} />
      <div className="row items-center gap-2">
        <LiveBadge fresh={fresh} />
        <Pill>
          <CalendarIcon className="size-3" />
          Date range
        </Pill>
        <Pill>
          <FilterIcon className="size-3" />
          Filters
        </Pill>
        <span className="flex-1" />
        <Pill>
          <Columns3Icon className="size-3" />
          Columns
        </Pill>
      </div>
    </>
  );
}

export function EventsContent() {
  return (
    <>
      <EventsToolbar />
      <EventsTable />
    </>
  );
}

export function EventsLiveContent() {
  return (
    <>
      <EventsToolbar fresh={4} />
      <EventsTable fresh={4} />
    </>
  );
}

const PURCHASE_TREND = [12, 15, 14, 18, 22, 21, 26, 31];

export function EventDrawerContent() {
  return (
    <div className="row items-start gap-3">
      <div className="@2xl:block hidden min-w-0 flex-1 opacity-50">
        <EventsTable rows={EVENTS.slice(0, 6)} />
      </div>
      <MockSheet
        className="max-w-full"
        description="Today 14:08:19 · Acme SaaS"
        title="purchase"
        width={340}
      >
        <SegmentedControl items={['Pretty', 'Raw']} />
        <div className="row items-center gap-2 rounded-md bg-neutral-50 p-2.5 text-[11.5px]">
          <Avatar initials="AS" />
          <span className="col min-w-0">
            <span className="font-medium">Ada Svensson · SE · Google</span>
            <span className="text-neutral-500">
              This session has 6 screen views and 9 events. Visit duration is 6m
              12s.
            </span>
          </span>
        </div>
        <div className="col gap-1.5">
          <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
            Properties
          </span>
          <KeyValue
            items={[
              { key: 'plan', value: <FilterValue>pro</FilterValue> },
              { key: 'payment', value: <FilterValue>card</FilterValue> },
              { key: 'revenue', value: <FilterValue>2900</FilterValue> },
              { key: 'coupon', value: <FilterValue>LAUNCH20</FilterValue> },
            ]}
          />
        </div>
        <div className="col gap-1.5">
          <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
            Information
          </span>
          <KeyValue
            items={[
              { key: 'path', value: <FilterValue>/checkout</FilterValue> },
              { key: 'referrerName', value: <FilterValue>Google</FilterValue> },
              { key: 'city', value: <FilterValue>Stockholm</FilterValue> },
              { key: 'brand', value: <FilterValue>Apple</FilterValue> },
            ]}
          />
        </div>
        <Panel title="All events for purchase">
          <AreaChart height={56} primary={PURCHASE_TREND} />
        </Panel>
      </MockSheet>
    </div>
  );
}

function FilterValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="group row items-center gap-1.5">
      {children}
      <FilterIcon className="size-2.5 text-neutral-300" />
    </span>
  );
}

const SWATCHES = [
  '#2563eb',
  '#059669',
  '#7c3aed',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#171717',
];
const ICON_CHOICES: EventKind[] = [
  'purchase',
  'signup',
  'click',
  'view',
  'ai',
  'link',
];

const CUSTOM_EVENTS = [
  { name: 'Activation', rule: 'project_created OR invite_sent' },
  { name: 'Paid conversion', rule: 'purchase WHERE plan is not free' },
  { name: 'Docs reader', rule: 'screen_view WHERE path starts with /docs' },
];

export function EventSettingsContent() {
  return (
    <div className="relative">
      <div className="grid @2xl:grid-cols-2 grid-cols-1 gap-3 opacity-60">
        <Panel padded={false} title="Custom events">
          {CUSTOM_EVENTS.map((custom) => (
            <div
              className="col gap-0.5 border-neutral-100 border-b px-3 py-2 text-[11.5px] last:border-b-0"
              key={custom.name}
            >
              <span className="font-medium">{custom.name}</span>
              <span className="font-mono text-neutral-500">{custom.rule}</span>
            </div>
          ))}
        </Panel>
        <Panel padded={false} title="Exclude events">
          {[
            ['IP addresses', '81.2.69.0/24, 10.0.0.12'],
            ['Profile IDs', 'usr_1 (founder), usr_2 (qa)'],
            ['Event rules', 'path contains /preview'],
          ].map(([label, value]) => (
            <div
              className="col gap-0.5 border-neutral-100 border-b px-3 py-2 text-[11.5px] last:border-b-0"
              key={label}
            >
              <span className="font-medium">{label}</span>
              <span className="font-mono text-neutral-500">{value}</span>
            </div>
          ))}
        </Panel>
      </div>
      <div className="row absolute inset-x-0 top-6 justify-center">
        <MockModal
          actions={
            <>
              <Pill>Cancel</Pill>
              <Pill active>Save</Pill>
            </>
          }
          title="Edit: purchase"
          width={400}
        >
          <label className="row items-center gap-2 text-[12px]">
            <span className="center-center size-4 rounded border border-neutral-900 bg-neutral-900 text-white">
              <CheckIcon className="size-3" />
            </span>
            Yes, this event is important!
            <MockBadge className="ml-auto" tone="blue">
              Conversion
            </MockBadge>
          </label>
          <div className="col gap-1.5 text-[12px]">
            <span className="font-medium text-neutral-700">Pick an icon</span>
            <div className="row flex-wrap gap-1.5">
              {ICON_CHOICES.map((kind) => (
                <span
                  className={cn(
                    'center-center size-7 rounded-md border',
                    kind === 'purchase'
                      ? 'border-neutral-900 bg-blue-50 text-blue-700'
                      : 'border-neutral-200 text-neutral-500'
                  )}
                  key={kind}
                >
                  {ICONS[kind]}
                </span>
              ))}
            </div>
          </div>
          <div className="col gap-1.5 text-[12px]">
            <span className="font-medium text-neutral-700">Pick a color</span>
            <div className="row flex-wrap gap-1.5">
              {SWATCHES.map((color, index) => (
                <span
                  className={cn(
                    'size-6 rounded-full',
                    index === 0 && 'ring-2 ring-neutral-900 ring-offset-2'
                  )}
                  key={color}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </MockModal>
      </div>
    </div>
  );
}

// Minis for the capability cards.

function MiniCode({
  lines,
}: {
  lines: { text: string; tone?: 'string' | 'muted' | 'keyword' }[];
}) {
  return (
    <pre className="overflow-hidden rounded-lg bg-neutral-900 p-3 font-mono text-[11px] text-neutral-200 leading-relaxed">
      {lines.map((line) => (
        <div
          className={cn(
            line.tone === 'string' && 'text-emerald-300',
            line.tone === 'keyword' && 'text-sky-300',
            line.tone === 'muted' && 'text-neutral-500'
          )}
          key={line.text}
        >
          {line.text}
        </div>
      ))}
    </pre>
  );
}

export function MiniTrackAttributes() {
  return (
    <div className="col gap-2">
      <MiniCode
        lines={[
          { text: '<button' },
          { text: '  data-track="signup"', tone: 'string' },
          { text: '  data-plan="pro">', tone: 'string' },
        ]}
      />
      <div className="row items-center gap-2 text-[11.5px]">
        <EventIcon kind="signup" />
        <span className="font-mono">signup</span>
        <MockBadge>plan: pro</MockBadge>
      </div>
    </div>
  );
}

export function MiniScreenViews() {
  const paths = ['/pricing', '/pricing#faq', '/signup'];
  return (
    <div className="col gap-1.5 text-[11.5px]">
      <span className="font-mono text-[11px] text-neutral-500">
        trackScreenViews: true
      </span>
      {paths.map((path, index) => (
        <div
          className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5"
          key={path}
        >
          <EventIcon kind="view" />
          <span className="font-mono">screen_view</span>
          <span className="truncate font-mono text-neutral-500">{path}</span>
          <span className="ml-auto font-mono text-[10.5px] text-neutral-400">
            {['pushState', 'hashchange', 'popstate'][index]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MiniOutgoingLinks() {
  return (
    <div className="col gap-2 text-[11.5px]">
      <span className="font-mono text-[11px] text-neutral-500">
        trackOutgoingLinks: true
      </span>
      <div className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5">
        <EventIcon kind="link" />
        <span className="font-mono">link_out</span>
        <span className="truncate font-mono text-neutral-500">
          github.com/openpanel-dev
        </span>
      </div>
      <MockBadge>text: "Star on GitHub"</MockBadge>
    </div>
  );
}

export function MiniAiEvent() {
  return (
    <div className="col gap-2 text-[11.5px]">
      <div className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5">
        <EventIcon kind="ai" />
        <span className="font-mono">ai_generation</span>
        <span className="ml-auto font-mono text-neutral-500">gpt-4.1</span>
      </div>
      <div className="row gap-1.5">
        <MockBadge tone="neutral">1,204 tokens</MockBadge>
        <MockBadge tone="neutral">$0.004</MockBadge>
        <MockBadge tone="neutral">820 ms</MockBadge>
      </div>
    </div>
  );
}

export function MiniSdkList() {
  const sdks = [
    'web',
    'sdk',
    'nextjs',
    'nuxt',
    'astro',
    'express',
    'react-native',
    'ai',
  ];
  return (
    <div className="row flex-wrap gap-1.5">
      {sdks.map((sdk) => (
        <span
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px]"
          key={sdk}
        >
          @openpanel/{sdk}
        </span>
      ))}
    </div>
  );
}

export function MiniRevenueCall() {
  return (
    <div className="col gap-2">
      <MiniCode
        lines={[
          { text: 'op.revenue(2900, {' },
          { text: "  plan: 'pro',", tone: 'string' },
          { text: '});' },
        ]}
      />
      <div className="row items-center gap-2 text-[11.5px]">
        <EventIcon kind="purchase" />
        <span className="font-mono">revenue</span>
        <span className="ml-auto font-mono text-emerald-600">$29.00</span>
      </div>
    </div>
  );
}

export const EVENT_MOCKS = {
  events: {
    content: () => <EventsContent />,
    shell: { page: 'events', project: 'Acme SaaS' },
    insetWidth: 940,
  },
  'events-live': {
    content: () => <EventsLiveContent />,
    shell: { page: 'events', project: 'Acme SaaS' },
    insetWidth: 940,
  },
  'event-drawer': {
    content: () => <EventDrawerContent />,
    shell: { page: 'events', project: 'Acme SaaS' },
    insetWidth: 940,
  },
  'event-settings': {
    content: () => <EventSettingsContent />,
    shell: { page: 'settings', project: 'Acme SaaS' },
    insetWidth: 860,
  },
  'mini-track-attributes': { content: () => <MiniTrackAttributes /> },
  'mini-screen-views': { content: () => <MiniScreenViews /> },
  'mini-outgoing-links': { content: () => <MiniOutgoingLinks /> },
  'mini-ai-event': { content: () => <MiniAiEvent /> },
  'mini-sdk-list': { content: () => <MiniSdkList /> },
  'mini-revenue-call': { content: () => <MiniRevenueCall /> },
} satisfies Record<string, MockDefinition>;
