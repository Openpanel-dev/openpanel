import { GlobeIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { AreaChart, Avatar, MockTable, MockTabs, StatCard } from './primitives';

// Smaller dashboard views used by feature and compare pages.

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
          label="CTR"
          unit="%"
          value="6.2"
        />
        <StatCard
          bars={[7, 7, 6, 6, 6, 5, 5, 5]}
          change="0.8"
          label="Avg. position"
          value="8.4"
        />
      </div>
      <div className="grid @2xl:grid-cols-[1.3fr_1fr] grid-cols-1 gap-3">
        <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
            Clicks and impressions
          </span>
          <AreaChart
            height={120}
            labels={['Oct 23', 'Oct 25', 'Oct 27', 'Oct 30']}
            primary={CLICKS}
            secondary={IMPRESSIONS.map((value) => value / 18)}
          />
        </div>
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
    </>
  );
}

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

const PROFILE_EVENTS = [
  { name: 'purchase', detail: 'Pro plan · $29', when: 'Today 14:02' },
  { name: 'screen_view', detail: '/settings/billing', when: 'Today 14:01' },
  { name: 'screen_view', detail: '/pricing', when: 'Today 13:58' },
  { name: 'sign_up', detail: 'email', when: 'Oct 24' },
  { name: 'screen_view', detail: '/', when: 'Oct 24' },
];

export function ProfileContent() {
  return (
    <div className="grid @2xl:grid-cols-[1fr_1.4fr] grid-cols-1 gap-3">
      <div className="col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="row items-center gap-3">
          <span className="center-center size-10 rounded-full bg-neutral-100 font-medium text-[12px]">
            AS
          </span>
          <span className="col">
            <span className="font-medium text-[13px]">Ada Svensson</span>
            <span className="text-[11px] text-neutral-500">
              ada@example.com · Pro
            </span>
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <dt className="text-neutral-500">First seen</dt>
          <dd className="font-mono">Oct 24</dd>
          <dt className="text-neutral-500">Sessions</dt>
          <dd className="font-mono">12</dd>
          <dt className="text-neutral-500">Country</dt>
          <dd className="row items-center gap-1">
            <GlobeIcon className="size-3 text-neutral-400" /> Sweden
          </dd>
          <dt className="text-neutral-500">Revenue</dt>
          <dd className="font-mono">$29.00</dd>
        </dl>
      </div>
      <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <span className="border-neutral-200 border-b px-3 py-2.5 font-medium text-[12px]">
          Activity
        </span>
        {PROFILE_EVENTS.map((event, index) => (
          <div
            className="row items-center gap-3 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
            // biome-ignore lint/suspicious/noArrayIndexKey: static rows with repeated names
            key={index}
          >
            <span className="size-1.5 rounded-full bg-blue-600" />
            <span className="font-mono">{event.name}</span>
            <span className="truncate text-neutral-500">{event.detail}</span>
            <span className="ml-auto whitespace-nowrap text-neutral-500">
              {event.when}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
