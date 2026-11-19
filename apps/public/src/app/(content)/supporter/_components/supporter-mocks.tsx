import { ChevronUpIcon, HashIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small replicas of what a supporter actually sees: the CLI, the release
// stream, Discord and the feedback board. Versions and names are examples.

const TERMINAL_LINES: { text: string; tone?: 'muted' | 'ok' | 'accent' }[] = [
  { text: '$ openpanel upgrade --supporter', tone: 'accent' },
  { text: '' },
  { text: '✓ Logged in to docker.openpanel.dev', tone: 'ok' },
  { text: '✓ Newest build: 3.1.9 (main, 14 minutes ago)', tone: 'ok' },
  { text: '' },
  { text: '  api        3.1.4  →  3.1.9' },
  { text: '  worker     3.1.4  →  3.1.9' },
  { text: '  dashboard  3.1.4  →  3.1.9' },
  { text: '' },
  { text: '? Apply 3 changes and restart?  Yes', tone: 'muted' },
  { text: '✓ Restarted. You are on the newest build.', tone: 'ok' },
];

export function UpgradeTerminal() {
  return (
    <div
      aria-hidden
      className="h-full overflow-hidden rounded-2xl bg-neutral-900 text-neutral-200 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.35)]"
    >
      <div className="row items-center gap-1.5 border-white/10 border-b px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-[12px] text-neutral-500">
          ssh analytics.acme.com
        </span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
        {TERMINAL_LINES.map((line, index) => (
          <div
            className={cn(
              line.tone === 'ok' && 'text-emerald-300',
              line.tone === 'muted' && 'text-neutral-500',
              line.tone === 'accent' && 'text-white'
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: static lines, some of them blank
            key={index}
          >
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

const BUILDS = [
  { version: '3.1.9', note: 'Fix: worker reconnects to Redis', when: 'today' },
  { version: '3.1.8', note: 'Faster retention queries', when: '2 days ago' },
  {
    version: '3.1.7',
    note: 'Fix: chart tooltips on Safari',
    when: '4 days ago',
  },
];

export function ReleaseMock() {
  return (
    <div className="col gap-3 text-[12px]">
      <div className="col gap-1.5 rounded-xl bg-neutral-50 p-3">
        {BUILDS.map((build) => (
          <div className="row items-center gap-2.5" key={build.version}>
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="font-medium font-mono">{build.version}</span>
            <span className="min-w-0 flex-1 truncate text-neutral-600">
              {build.note}
            </span>
            <span className="text-neutral-400">{build.when}</span>
          </div>
        ))}
      </div>
      <div className="row items-center gap-2.5 px-3 text-neutral-400">
        <span className="size-2 shrink-0 rounded-full bg-neutral-300" />
        <span className="font-mono">3.1.4</span>
        <span className="flex-1">Last public release</span>
        <span>3 weeks ago</span>
      </div>
    </div>
  );
}

function ChatAvatar({ initials, dark }: { initials: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        'center-center size-7 shrink-0 rounded-full font-medium text-[10px]',
        dark ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
      )}
    >
      {initials}
    </span>
  );
}

function SupporterBadge() {
  return (
    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-[10px] text-emerald-700">
      Supporter
    </span>
  );
}

export function SupportMock() {
  return (
    <div className="col gap-3 text-[12px]">
      <div className="row items-center gap-1.5 text-neutral-400">
        <HashIcon className="size-3.5" />
        supporters
      </div>
      <div className="row items-start gap-2.5">
        <ChatAvatar initials="MK" />
        <div className="col gap-0.5">
          <span className="row items-center gap-1.5">
            <span className="font-medium">Maja</span>
            <SupporterBadge />
            <span className="text-neutral-400">10:02</span>
          </span>
          <span className="text-neutral-600">
            Worker restarts every few hours after the upgrade. Logs attached.
          </span>
        </div>
      </div>
      <div className="row items-start gap-2.5">
        <ChatAvatar dark initials="OP" />
        <div className="col gap-0.5">
          <span className="row items-center gap-1.5">
            <span className="font-medium">OpenPanel team</span>
            <span className="text-neutral-400">10:09</span>
          </span>
          <span className="text-neutral-600">
            Found it, a Redis timeout. Fixed in 3.1.9, pull the newest image.
          </span>
        </div>
      </div>
    </div>
  );
}

const REQUESTS = [
  {
    title: 'Weekly digest in Slack',
    votes: 128,
    supporter: true,
    status: 'Under review',
  },
  {
    title: 'Custom date presets',
    votes: 96,
    supporter: true,
    status: 'Under review',
  },
  {
    title: 'Bulk-edit dashboards',
    votes: 71,
    supporter: false,
    status: 'Open',
  },
];

export function RoadmapMock() {
  return (
    <ul className="col gap-2 text-[12px]">
      {REQUESTS.map((request) => (
        <li
          className="row items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5"
          key={request.title}
        >
          <span className="col w-10 shrink-0 items-center rounded-lg bg-neutral-50 py-1 text-neutral-600">
            <ChevronUpIcon className="size-3.5" />
            <span className="font-mono">{request.votes}</span>
          </span>
          <span className="col min-w-0 flex-1 gap-1">
            <span className="truncate font-medium">{request.title}</span>
            <span className="row items-center gap-1.5">
              {request.supporter && <SupporterBadge />}
              <span className="text-neutral-400">{request.status}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const MEMBERS = [
  { initials: 'JL', name: 'Jonas L.', supporter: true },
  { initials: 'AS', name: 'Amara S.', supporter: true },
  { initials: 'You', name: 'You', supporter: true, highlight: true },
  { initials: 'TP', name: 'Tom P.', supporter: false },
];

export function DiscordMock() {
  return (
    <ul className="col gap-2 text-[12px]">
      {MEMBERS.map((member) => (
        <li
          className={cn(
            'row items-center gap-2.5 rounded-xl p-2',
            member.highlight && 'bg-neutral-50 ring-1 ring-black/5'
          )}
          key={member.name}
        >
          <ChatAvatar dark={member.highlight} initials={member.initials} />
          <span className="flex-1 font-medium">{member.name}</span>
          {member.supporter ? (
            <SupporterBadge />
          ) : (
            <span className="text-neutral-400">Member</span>
          )}
        </li>
      ))}
    </ul>
  );
}
