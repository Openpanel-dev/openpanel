import { BuildingIcon, FilterIcon, SearchIcon, VideoIcon } from 'lucide-react';
import {
  Avatar,
  BarChart,
  KeyValue,
  MockBadge,
  MockTabs,
  Panel,
  Pill,
  StatCard,
} from './primitives';
import { Timeline } from './primitives-ui';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Profiles list, the profile page, the identify flow and groups.

const PROFILE_TILES = [
  { label: 'Total Events', value: '184' },
  { label: 'Sessions', value: '12' },
  { label: 'Page Views', value: '96' },
  { label: 'Avg Events/Session', value: '15.3' },
  { label: 'Bounce Rate', value: '8', unit: '%' },
  { label: 'Days Active', value: '9' },
  { label: 'Conversion Events', value: '3' },
  { label: 'Revenue', value: '$148.00' },
];

const LATEST_EVENTS = [
  { label: 'purchase', detail: 'Pro plan · $29.00', time: 'Today 14:08' },
  { label: 'screen_view', detail: '/checkout', time: 'Today 14:07' },
  { label: 'started_trial', detail: 'plan: pro', time: 'Today 14:04' },
  { label: 'screen_view', detail: '/pricing', time: 'Today 14:02' },
  { label: 'invite_sent', detail: 'to: jonas@acme.io', time: 'Oct 28' },
  { label: 'project_created', detail: 'Acme Web', time: 'Oct 24' },
];

const WEEKS = 20;
const DAYS = 7;
// Activity per day for the last 20 weeks, 0–4. A fixed pattern so the
// heatmap is the same on every render.
const ACTIVITY_PATTERN = [
  0, 2, 1, 3, 0, 4, 2, 1, 0, 3, 2, 4, 1, 0, 2, 3, 1, 4, 0, 2, 3, 1,
];

function activityLevel(week: number, day: number) {
  const level = ACTIVITY_PATTERN[(week * 7 + day) % ACTIVITY_PATTERN.length];
  if (week < 4) {
    return 0;
  }
  if (day > 4 && level > 2) {
    return 0;
  }
  return level;
}

export function ActivityHeatmap({ weeks = WEEKS }: { weeks?: number }) {
  const columns = Array.from({ length: weeks }, (_, index) => index);
  const rows = Array.from({ length: DAYS }, (_, index) => index);
  return (
    <div
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${DAYS}, minmax(0, 1fr))`,
        gridAutoFlow: 'column',
      }}
    >
      {columns.flatMap((week) =>
        rows.map((day) => {
          const level = activityLevel(week, day);
          return (
            <span
              className="aspect-square rounded-[2px]"
              key={`${week}-${day}`}
              style={{
                backgroundColor:
                  level === 0
                    ? 'rgba(0,0,0,0.05)'
                    : `rgba(37, 99, 235, ${0.2 + level * 0.2})`,
              }}
            />
          );
        })
      )}
    </div>
  );
}

function ProfileHeader({ name, email }: { name: string; email: string }) {
  return (
    <div className="row flex-wrap items-center gap-3">
      <span className="center-center size-9 rounded-full bg-neutral-100 font-medium text-[12px]">
        {name
          .split(' ')
          .map((part) => part[0])
          .join('')}
      </span>
      <span className="col">
        <span className="font-medium text-[13px]">{name}</span>
        <span className="text-[11px] text-neutral-500">{email}</span>
      </span>
      <MockBadge>SE · Stockholm</MockBadge>
      <MockBadge>Desktop</MockBadge>
      <MockBadge>macOS</MockBadge>
      <MockBadge>Chrome 128</MockBadge>
    </div>
  );
}

export function ProfileContent() {
  return (
    <>
      <ProfileHeader email="ada@acme.io · Pro" name="Ada Svensson" />
      <MockTabs items={['Overview', 'Events', 'Sessions']} />
      <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {PROFILE_TILES.map((tile) => (
          <StatCard key={tile.label} period="All time" {...tile} />
        ))}
      </div>
      <div className="grid @2xl:grid-cols-[1fr_1.4fr] grid-cols-1 gap-3">
        <Panel title="Profile Information">
          <KeyValue
            items={[
              { key: 'id', value: 'usr_4821' },
              { key: 'email', value: 'ada@acme.io' },
              { key: 'plan', value: 'pro' },
              { key: 'company', value: 'Acme Inc' },
              { key: 'createdAt', value: 'Oct 24, 09:12' },
              { key: 'lastSeenAt', value: 'Today 14:08' },
              { key: 'referrer', value: 'Google' },
            ]}
          />
        </Panel>
        <div className="col gap-3">
          <Panel title="Activity">
            <ActivityHeatmap />
          </Panel>
          <Panel padded={false} title="Latest Events">
            <Timeline className="pt-1" items={LATEST_EVENTS.slice(0, 4)} />
          </Panel>
        </div>
      </div>
    </>
  );
}

const MERGE_EVENTS = [
  { label: 'screen_view', detail: '/', time: '13:58' },
  { label: 'screen_view', detail: '/pricing', time: '14:02' },
  { label: 'started_trial', detail: 'plan: pro', time: '14:04' },
  { label: 'screen_view', detail: '/onboarding', time: '14:05' },
];

function EventLine({
  event,
  who,
  identified,
}: {
  event: (typeof MERGE_EVENTS)[number];
  who: string;
  identified: boolean;
}) {
  return (
    <div
      className={cn(
        'row items-center gap-3 border-neutral-100 border-b px-3 py-2 text-[11.5px] last:border-b-0',
        identified && 'bg-blue-50/60'
      )}
    >
      <span className="font-mono text-neutral-500">{event.time}</span>
      <span className="font-mono">{event.label}</span>
      <span className="truncate text-neutral-500">{event.detail}</span>
      <span className="row ml-auto items-center gap-1.5">
        <Avatar initials={identified ? 'AS' : '?'} />
        <span className={cn(identified ? 'font-medium' : 'text-neutral-400')}>
          {who}
        </span>
      </span>
    </div>
  );
}

// The same session before and after identify(): the earlier rows are
// rewritten to the profile.
export function IdentifyMergeContent() {
  return (
    <div className="grid @2xl:grid-cols-2 grid-cols-1 gap-3">
      <Panel padded={false} title="Before identify">
        {MERGE_EVENTS.map((event) => (
          <EventLine
            event={event}
            identified={false}
            key={event.time}
            who="Anonymous 7f3a…c91e"
          />
        ))}
      </Panel>
      <Panel padded={false} title="After identify · same session">
        {MERGE_EVENTS.slice(0, 3).map((event) => (
          <EventLine
            event={event}
            identified
            key={event.time}
            who="Ada Svensson"
          />
        ))}
        <div className="row items-center gap-2 border-neutral-100 border-b bg-neutral-900 px-3 py-1.5 font-mono text-[11px] text-white">
          <span className="text-emerald-300">identify</span>
          {"({ profileId: 'usr_4821', email: 'ada@acme.io' })"}
        </div>
        <EventLine event={MERGE_EVENTS[3]} identified who="Ada Svensson" />
      </Panel>
    </div>
  );
}

const PROFILES = [
  {
    events: 1204,
    name: 'Ada Svensson',
    referrer: 'Google',
    country: 'SE',
    os: 'macOS',
    browser: 'Chrome',
    first: 'Oct 24',
    last: '2 min ago',
    group: 'Acme Inc',
  },
  {
    events: 880,
    name: 'Jonas Kahn',
    referrer: 'Direct',
    country: 'US',
    os: 'Windows',
    browser: 'Edge',
    first: 'Sep 2',
    last: '1 h ago',
    group: 'Acme Inc',
  },
  {
    events: 731,
    name: 'Tomoko Park',
    referrer: 'Product Hunt',
    country: 'JP',
    os: 'iOS',
    browser: 'Safari',
    first: 'Oct 1',
    last: '3 h ago',
    group: 'Kaito',
  },
  {
    events: 512,
    name: 'Mia Lund',
    referrer: 'X',
    country: 'DK',
    os: 'macOS',
    browser: 'Firefox',
    first: 'Aug 14',
    last: 'Yesterday',
    group: 'Nordic Labs',
  },
  {
    events: 498,
    name: 'Sam Byrne',
    referrer: 'Google',
    country: 'IE',
    os: 'Android',
    browser: 'Chrome',
    first: 'Oct 12',
    last: 'Yesterday',
    group: '',
  },
  {
    events: 455,
    name: 'Rafael Costa',
    referrer: 'LinkedIn',
    country: 'PT',
    os: 'macOS',
    browser: 'Chrome',
    first: 'Jul 30',
    last: 'Oct 29',
    group: 'Kaito',
  },
];

const PROFILE_COLUMNS =
  '52px minmax(0,1.3fr) 90px 36px 70px 64px 60px 70px minmax(0,0.9fr)';

export function ProfilesListContent() {
  return (
    <>
      <MockTabs active={2} items={['Identified', 'Anonymous', 'Power users']} />
      <div className="row items-center gap-2">
        <span className="row flex-1 items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1.5 text-[12px] text-neutral-500">
          <SearchIcon className="size-3" />
          Search profiles
        </span>
        <Pill>
          <FilterIcon className="size-3" />
          Profile filters
        </Pill>
      </div>
      <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div
          className="grid gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider"
          style={{ gridTemplateColumns: PROFILE_COLUMNS }}
        >
          <span>Events</span>
          <span>Name</span>
          <span>Referrer</span>
          <span>Ctry</span>
          <span>OS</span>
          <span>Browser</span>
          <span>First seen</span>
          <span>Last seen</span>
          <span>Groups</span>
        </div>
        {PROFILES.map((profile) => (
          <div
            className="grid items-center gap-x-3 border-neutral-100 border-b px-3 py-2 text-[11.5px] last:border-b-0"
            key={profile.name}
            style={{ gridTemplateColumns: PROFILE_COLUMNS }}
          >
            <span className="font-medium font-mono">
              {profile.events.toLocaleString('en-US')}
            </span>
            <span className="row min-w-0 items-center gap-1.5">
              <Avatar
                initials={profile.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              />
              <span className="truncate">{profile.name}</span>
            </span>
            <span className="truncate text-neutral-700">
              {profile.referrer}
            </span>
            <span className="font-mono text-neutral-600">
              {profile.country}
            </span>
            <span className="truncate text-neutral-700">{profile.os}</span>
            <span className="truncate text-neutral-700">{profile.browser}</span>
            <span className="font-mono text-neutral-600">{profile.first}</span>
            <span className="truncate text-neutral-600">{profile.last}</span>
            <span className="truncate">
              {profile.group ? <MockBadge>{profile.group}</MockBadge> : null}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const MEMBERS = PROFILES.filter((profile) => profile.group === 'Acme Inc');

export function GroupPageContent() {
  return (
    <>
      <div className="row flex-wrap items-center gap-3">
        <span className="center-center size-9 rounded-lg bg-neutral-100">
          <BuildingIcon className="size-4 text-neutral-600" />
        </span>
        <span className="col">
          <span className="font-medium text-[13px]">Acme Inc</span>
          <span className="text-[11px] text-neutral-500">
            grp_acme · company
          </span>
        </span>
        <MockBadge tone="blue">Pro plan</MockBadge>
        <MockBadge>Stockholm</MockBadge>
      </div>
      <MockTabs items={['Overview', 'Members', 'Events']} />
      <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <StatCard label="Total Events" period="All time" value="6,412" />
        <StatCard label="Unique Members" period="All time" value="14" />
        <StatCard label="First Seen" period="" value="Jul 30" />
        <StatCard label="Last Seen" period="" value="2 min ago" />
      </div>
      <div className="grid @2xl:grid-cols-[1fr_1.4fr] grid-cols-1 gap-3">
        <Panel title="New members last 30 days">
          <BarChart
            height={80}
            labels={['Oct 1', 'Oct 15', 'Oct 30']}
            values={[0, 1, 0, 2, 1, 0, 1, 3, 1, 2, 0, 1, 2, 0]}
          />
        </Panel>
        <Panel padded={false} title="Members">
          {MEMBERS.map((member) => (
            <div
              className="row items-center gap-2 border-neutral-100 border-b px-3 py-2 text-[11.5px] last:border-b-0"
              key={member.name}
            >
              <Avatar
                initials={member.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              />
              <span>{member.name}</span>
              <span className="ml-auto font-mono text-neutral-500">
                {member.events.toLocaleString('en-US')} events
              </span>
              <span className="text-neutral-500">{member.last}</span>
            </div>
          ))}
          <div className="row items-center gap-2 px-3 py-2 text-[11.5px] text-neutral-500">
            + 12 more
          </div>
        </Panel>
      </div>
    </>
  );
}

// Minis for the capability cards.

export function MiniActivityHeatmap() {
  return (
    <div className="col gap-2">
      <div className="row items-baseline justify-between">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Activity
        </span>
        <span className="font-mono text-[11px] text-neutral-500">
          9 days active
        </span>
      </div>
      <ActivityHeatmap weeks={16} />
    </div>
  );
}

export function MiniCounter() {
  return (
    <div className="col gap-2 text-[12px]">
      <div className="rounded-md bg-neutral-900 px-2.5 py-1.5 font-mono text-[11px] text-white">
        op.increment({'{'} property:{' '}
        <span className="text-emerald-300">'projects_created'</span> {'}'})
      </div>
      <div className="row items-center justify-between rounded-md border border-neutral-200 bg-white px-2.5 py-1.5">
        <span className="text-neutral-500">projects_created</span>
        <span className="row items-center gap-1.5 font-mono">
          <span className="text-neutral-400 line-through">3</span>
          <span className="font-semibold">4</span>
        </span>
      </div>
    </div>
  );
}

export function MiniProfileSessions() {
  const rows = [
    { when: 'Today 14:02', pages: 5, duration: '6m 12s', replay: true },
    { when: 'Oct 28', pages: 3, duration: '2m 40s', replay: true },
    { when: 'Oct 24', pages: 8, duration: '9m 05s', replay: false },
  ];
  return (
    <div className="col gap-1.5 text-[11.5px]">
      {rows.map((row) => (
        <div
          className="row items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5"
          key={row.when}
        >
          <span className="text-neutral-700">{row.when}</span>
          <span className="font-mono text-neutral-500">{row.pages} pages</span>
          <span className="ml-auto font-mono text-neutral-500">
            {row.duration}
          </span>
          {row.replay && <VideoIcon className="size-3 text-blue-600" />}
        </div>
      ))}
    </div>
  );
}

export function MiniProfileRevenue() {
  return (
    <div className="col gap-2">
      <div className="row items-baseline gap-2">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Revenue
        </span>
        <span className="ml-auto font-mono text-[11px] text-neutral-500">
          3 payments
        </span>
      </div>
      <span className="font-mono font-semibold text-xl">$148.00</span>
      <div className="col gap-1 text-[11.5px]">
        {[
          ['Today', 'Pro plan', '$29.00'],
          ['Oct 1', 'Pro plan', '$29.00'],
          ['Sep 1', 'Team plan', '$90.00'],
        ].map(([when, what, amount]) => (
          <span className="row items-center gap-2" key={when}>
            <span className="text-neutral-500">{when}</span>
            <span>{what}</span>
            <span className="ml-auto font-mono text-emerald-600">{amount}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniCohortBadges() {
  return (
    <div className="col gap-2">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        Cohorts
      </span>
      <div className="row flex-wrap gap-1.5">
        <MockBadge tone="blue">Trial users</MockBadge>
        <MockBadge tone="blue">Signed up from Product Hunt</MockBadge>
        <MockBadge tone="blue">Power users · 30d</MockBadge>
      </div>
      <span className="text-[11px] text-neutral-500">
        Membership refreshes every 30 minutes
      </span>
    </div>
  );
}

export function MiniCustomProps() {
  return (
    <KeyValue
      items={[
        { key: 'plan', value: 'pro' },
        { key: 'company', value: 'Acme Inc' },
        { key: 'seats', value: '14' },
        { key: 'trial_ends', value: '2026-11-14' },
        { key: 'referrer_code', value: 'LAUNCH20' },
      ]}
    />
  );
}

export const PROFILE_MOCKS = {
  profile: {
    content: () => <ProfileContent />,
    shell: { page: 'profiles', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  'identify-merge': {
    content: () => <IdentifyMergeContent />,
    shell: { page: 'profiles', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  'profiles-list': {
    content: () => <ProfilesListContent />,
    shell: { page: 'profiles', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  'group-page': {
    content: () => <GroupPageContent />,
    shell: { page: 'profiles', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  'mini-activity-heatmap': { content: () => <MiniActivityHeatmap /> },
  'mini-counter': { content: () => <MiniCounter /> },
  'mini-profile-sessions': { content: () => <MiniProfileSessions /> },
  'mini-profile-revenue': { content: () => <MiniProfileRevenue /> },
  'mini-cohort-badges': { content: () => <MiniCohortBadges /> },
  'mini-custom-props': { content: () => <MiniCustomProps /> },
} satisfies Record<string, MockDefinition>;
