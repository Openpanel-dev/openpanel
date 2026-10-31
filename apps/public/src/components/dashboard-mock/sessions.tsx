import { MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { Avatar } from './primitives';
import type { MockDefinition } from './types';

// Sessions list, session detail and session replay views.

const SESSIONS = [
  {
    user: 'AS',
    where: 'Stockholm, SE',
    device: 'desktop',
    entry: '/pricing',
    events: 14,
    duration: '6m 12s',
    when: '2 min ago',
  },
  {
    user: 'ML',
    where: 'Berlin, DE',
    device: 'mobile',
    entry: '/',
    events: 5,
    duration: '1m 04s',
    when: '5 min ago',
  },
  {
    user: 'JK',
    where: 'Austin, US',
    device: 'desktop',
    entry: '/docs/sdks/react',
    events: 22,
    duration: '11m 40s',
    when: '9 min ago',
  },
  {
    user: 'SB',
    where: 'Lisbon, PT',
    device: 'mobile',
    entry: '/articles/mixpanel-pricing',
    events: 3,
    duration: '0m 48s',
    when: '12 min ago',
  },
  {
    user: 'TP',
    where: 'Tokyo, JP',
    device: 'desktop',
    entry: '/compare/posthog-alternative',
    events: 9,
    duration: '3m 30s',
    when: '15 min ago',
  },
];

export function SessionsContent() {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-[auto_1.4fr_1.4fr_auto_auto_auto] gap-x-4 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>User</span>
        <span>Location</span>
        <span>Entry page</span>
        <span className="text-right">Events</span>
        <span className="text-right">Duration</span>
        <span className="text-right">When</span>
      </div>
      {SESSIONS.map((session) => (
        <div
          className="grid grid-cols-[auto_1.4fr_1.4fr_auto_auto_auto] items-center gap-x-4 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
          key={session.user}
        >
          <Avatar initials={session.user} />
          <span className="row items-center gap-1.5 text-neutral-700">
            {session.device === 'mobile' ? (
              <SmartphoneIcon className="size-3 text-neutral-400" />
            ) : (
              <MonitorIcon className="size-3 text-neutral-400" />
            )}
            {session.where}
          </span>
          <span className="truncate font-mono text-neutral-600">
            {session.entry}
          </span>
          <span className="text-right font-mono">{session.events}</span>
          <span className="text-right font-mono text-neutral-600">
            {session.duration}
          </span>
          <span className="text-right text-neutral-500">{session.when}</span>
        </div>
      ))}
    </div>
  );
}

export const SESSION_MOCKS = {
  sessions: {
    content: () => <SessionsContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 820,
  },
} satisfies Record<string, MockDefinition>;
