import { MousePointer2Icon, VideoIcon } from 'lucide-react';
import { MockBadge, Panel, Pill } from './primitives';
import {
  BrowserFrame,
  PlayerBar,
  RecordedPage,
  Timeline,
} from './primitives-ui';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Session replay: the player on the session page, privacy defaults and
// how the recorder loads.

const REPLAY_EVENTS = [
  { label: 'screen_view', detail: '/pricing', time: '00:00' },
  { label: 'click', detail: 'Start free trial', time: '00:31' },
  { label: 'sign_up', detail: 'email', time: '00:58' },
  { label: 'screen_view', detail: '/welcome', time: '01:02' },
  { label: 'screen_view', detail: '/onboarding/connect', time: '01:24' },
  { label: 'copy_snippet', detail: 'Next.js', time: '02:10', muted: true },
  { label: 'screen_view', detail: '/dashboard', time: '03:40', muted: true },
  { label: 'first_event', detail: 'screen_view', time: '04:05', muted: true },
];

const TICKS = [0, 12, 23, 24, 25, 33, 52, 88, 97];

function Recording({ masked = true }: { masked?: boolean }) {
  return (
    <div className="relative">
      <RecordedPage masked={masked} />
      <span className="absolute top-[108px] left-[88px] size-6 rounded-full border-2 border-blue-500/60" />
      <MousePointer2Icon className="absolute top-[112px] left-[94px] size-4 fill-white text-neutral-900" />
    </div>
  );
}

function Player({ cluster = false }: { cluster?: boolean }) {
  return (
    <div className="col gap-3">
      <BrowserFrame time="01:24 / 04:10" url="acme.io/onboarding/connect">
        <Recording />
      </BrowserFrame>
      <div className="relative">
        <PlayerBar progress={33} ticks={TICKS} />
        {cluster && (
          <>
            <span
              className="center-center absolute -top-4 size-4 rounded-full bg-blue-600 font-mono text-[9px] text-white"
              style={{ left: 'calc(24% + 48px)' }}
            >
              3
            </span>
            <div
              className="col absolute top-6 gap-1 rounded-lg border border-neutral-200 bg-white p-2.5 text-[11px] shadow-lg"
              style={{ left: 'calc(24% + 20px)' }}
            >
              <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
                3 events at 00:58
              </span>
              <span className="font-mono">sign_up · email</span>
              <span className="font-mono">screen_view · /welcome</span>
              <span className="font-mono">
                screen_view · /onboarding/connect
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TimelinePanel({ compact = false }: { compact?: boolean }) {
  return (
    <Panel className="h-full" padded={false} title="Timeline">
      <Timeline
        className="pt-1"
        items={compact ? REPLAY_EVENTS.slice(0, 5) : REPLAY_EVENTS}
      />
      <span className="px-3 pt-1 pb-3 text-[11px] text-neutral-400">
        Events appear as the replay plays.
      </span>
    </Panel>
  );
}

export function ReplayContent() {
  return (
    <>
      <div className="row flex-wrap items-center gap-2">
        <span className="font-medium text-[13px]">Session: 3f9a1c7e</span>
        <MockBadge>SE · Stockholm</MockBadge>
        <MockBadge>Desktop</MockBadge>
        <MockBadge>macOS</MockBadge>
        <MockBadge>Chrome 128</MockBadge>
      </div>
      <div className="grid @2xl:grid-cols-[1fr_300px] grid-cols-1 gap-3">
        <Panel>
          <Player />
        </Panel>
        <TimelinePanel />
      </div>
    </>
  );
}

export function ReplayPlayerContent() {
  return (
    <Panel className="pb-20">
      <Player cluster />
    </Panel>
  );
}

const CONFIG_LINES = [
  { text: 'new OpenPanel({', tone: 'plain' },
  { text: "  clientId: 'YOUR_CLIENT_ID',", tone: 'string' },
  { text: '  sessionReplay: {', tone: 'plain' },
  { text: '    enabled: true,', tone: 'plain' },
  { text: '    maskAllText: true,     // default', tone: 'muted' },
  { text: '    maskAllInputs: true,   // default', tone: 'muted' },
  { text: "    unmaskTextSelector: '.op-unmask',", tone: 'string' },
  { text: '  },', tone: 'plain' },
  { text: '});', tone: 'plain' },
] as const;

function HatchedBlock() {
  return (
    <div className="col absolute top-3 right-3 h-24 w-36 items-center justify-center rounded-md border border-neutral-300 border-dashed bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.05)_6px,rgba(0,0,0,0.05)_12px)] text-center">
      <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[9.5px] text-neutral-600 ring-1 ring-black/6">
        data-openpanel-replay-block
      </span>
    </div>
  );
}

export function ReplayPrivacyContent() {
  return (
    <div className="grid @2xl:grid-cols-[1fr_1fr] grid-cols-1 gap-3">
      <Panel padded={false}>
        <BrowserFrame time="00:58 / 04:10" url="acme.io/signup">
          <div className="relative">
            <RecordedPage masked />
            <HatchedBlock />
          </div>
        </BrowserFrame>
        <div className="row flex-wrap gap-1.5 p-3">
          <MockBadge tone="emerald">text masked</MockBadge>
          <MockBadge tone="emerald">inputs masked</MockBadge>
          <MockBadge tone="emerald">hidden inputs blocked</MockBadge>
          <MockBadge>1 element blocked</MockBadge>
        </div>
      </Panel>
      <div className="overflow-hidden rounded-lg bg-neutral-900 p-4 font-mono text-[11.5px] text-neutral-200 leading-relaxed">
        {CONFIG_LINES.map((line) => (
          <div
            className={cn(
              line.tone === 'string' && 'text-emerald-300',
              line.tone === 'muted' && 'text-neutral-500'
            )}
            key={line.text}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

const REQUESTS = [
  {
    name: 'index.html',
    type: 'document',
    size: '14.2 kB',
    start: 0,
    width: 8,
    tone: 'neutral',
  },
  {
    name: 'app.js',
    type: 'script',
    size: '182 kB',
    start: 6,
    width: 18,
    tone: 'neutral',
  },
  {
    name: 'op1.js',
    type: 'script',
    size: '7.1 kB',
    start: 8,
    width: 6,
    tone: 'blue',
  },
  {
    name: 'op1-replay.js',
    type: 'script · lazy',
    size: '48 kB',
    start: 30,
    width: 10,
    tone: 'blue',
  },
  {
    name: '/replay (chunk 1)',
    type: 'POST · 10 s',
    size: '61 kB',
    start: 44,
    width: 4,
    tone: 'blue',
  },
  {
    name: '/replay (chunk 2)',
    type: 'POST · 10 s',
    size: '38 kB',
    start: 62,
    width: 4,
    tone: 'blue',
  },
  {
    name: '/replay (chunk 3)',
    type: 'POST · tab hidden',
    size: '12 kB',
    start: 86,
    width: 3,
    tone: 'blue',
  },
] as const;

export function ReplayLoadingContent() {
  return (
    <Panel padded={false}>
      <div className="grid grid-cols-[1.2fr_1fr_0.6fr_2fr] gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>Name</span>
        <span>Type</span>
        <span>Size</span>
        <span>Waterfall</span>
      </div>
      {REQUESTS.map((request) => (
        <div
          className="grid grid-cols-[1.2fr_1fr_0.6fr_2fr] items-center gap-x-3 border-neutral-100 border-b px-3 py-1.5 text-[11.5px] last:border-b-0"
          key={request.name}
        >
          <span
            className={cn(
              'truncate font-mono',
              request.tone === 'blue' && 'text-blue-700'
            )}
          >
            {request.name}
          </span>
          <span className="truncate text-neutral-500">{request.type}</span>
          <span className="whitespace-nowrap font-mono text-neutral-600">
            {request.size}
          </span>
          <span className="relative h-2.5 rounded bg-neutral-100">
            <span
              className={cn(
                'absolute inset-y-0 rounded',
                request.tone === 'blue' ? 'bg-blue-600' : 'bg-neutral-300'
              )}
              style={{ left: `${request.start}%`, width: `${request.width}%` }}
            />
            {request.name === 'op1-replay.js' && (
              <span
                className="absolute -top-0.5 h-3.5 border-emerald-500 border-l border-dashed"
                style={{ left: '28%' }}
              />
            )}
          </span>
        </div>
      ))}
      <div className="row items-center gap-3 px-3 py-2 text-[11px] text-neutral-500">
        <span className="h-3 border-emerald-500 border-l border-dashed" />
        page interactive
        <span className="ml-auto">
          chunks: every 10 s · max 200 events · max 1 MB
        </span>
      </div>
    </Panel>
  );
}

// Minis for the capability cards.

export function MiniKeptDays() {
  const days = Array.from({ length: 35 }, (_, index) => index);
  return (
    <div className="col gap-2">
      <div className="row items-baseline gap-2">
        <span className="font-mono font-semibold text-xl">30</span>
        <span className="text-[11px] text-neutral-500">days, then gone</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <span
            className={cn(
              'h-4 rounded-sm',
              day < 30 ? 'bg-blue-600/70' : 'bg-neutral-100'
            )}
            key={day}
          />
        ))}
      </div>
    </div>
  );
}

export function MiniSampleRate() {
  const loads = Array.from({ length: 24 }, (_, index) => index);
  return (
    <div className="col gap-2">
      <span className="font-mono text-[12px]">sampleRate: 0.25</span>
      <div className="grid grid-cols-12 gap-1">
        {loads.map((load) => (
          <span
            className={cn(
              'center-center h-6 rounded',
              load % 4 === 0
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-100 text-neutral-300'
            )}
            key={load}
          >
            {load % 4 === 0 && <VideoIcon className="size-3" />}
          </span>
        ))}
      </div>
      <span className="text-[11px] text-neutral-500">
        one page load in four is recorded
      </span>
    </div>
  );
}

export function MiniReplayRow() {
  return (
    <div className="col gap-1.5 text-[11.5px]">
      {['3f9a1c7e', 'b81d02aa', '27ab5d90'].map((id, index) => (
        <div
          className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5"
          key={id}
        >
          <span className="font-mono text-neutral-600">{id}</span>
          <VideoIcon className="size-3 text-blue-600" />
          <span className="ml-auto text-neutral-500">
            {['6m 12s', '1m 04s', '0m 48s'][index]}
          </span>
          <Pill className="px-1.5 py-0.5 text-[10px]">View replay</Pill>
        </div>
      ))}
    </div>
  );
}

export function MiniReplayStorage() {
  return (
    <div className="col gap-2 text-[11.5px]">
      <pre className="overflow-hidden rounded-lg bg-neutral-900 p-3 font-mono text-[11px] text-neutral-200 leading-relaxed">
        <div className="text-sky-300">CREATE TABLE session_replay_chunks</div>
        <div> ... CODEC(ZSTD)</div>
        <div className="text-emerald-300">
          {' '}
          TTL started_at + INTERVAL 30 DAY
        </div>
      </pre>
      <span className="text-neutral-500">your ClickHouse when self-hosted</span>
    </div>
  );
}

export function MiniNoQuota() {
  const rows = [
    ['Events', '412,380 / 1M', 41],
    ['Replays', '12,480', 100],
    ['Members', '14', 100],
  ] as const;
  return (
    <div className="col gap-2 text-[11.5px]">
      {rows.map(([label, value, share]) => (
        <div className="col gap-1" key={label}>
          <span className="row items-center justify-between">
            <span className="text-neutral-700">{label}</span>
            <span className="font-mono text-neutral-500">
              {value}
              {share === 100 && (
                <span className="ml-1 text-emerald-600">no limit</span>
              )}
            </span>
          </span>
          <span className="h-1.5 rounded-full bg-neutral-100">
            <span
              className={cn(
                'block h-full rounded-full',
                share === 100 ? 'bg-emerald-500/60' : 'bg-blue-600'
              )}
              style={{ width: `${share}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export const REPLAY_MOCKS = {
  replay: {
    content: () => <ReplayContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 900,
  },
  'replay-player': {
    content: () => <ReplayPlayerContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 760,
  },
  'replay-privacy': {
    content: () => <ReplayPrivacyContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 860,
  },
  'replay-loading': {
    content: () => <ReplayLoadingContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 820,
  },
  'mini-kept-days': { content: () => <MiniKeptDays /> },
  'mini-sample-rate': { content: () => <MiniSampleRate /> },
  'mini-replay-row': { content: () => <MiniReplayRow /> },
  'mini-replay-storage': { content: () => <MiniReplayStorage /> },
  'mini-no-quota': { content: () => <MiniNoQuota /> },
} satisfies Record<string, MockDefinition>;
