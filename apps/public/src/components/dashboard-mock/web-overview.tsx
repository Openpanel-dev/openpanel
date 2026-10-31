import { AreaChart, MockTable, MockTabs, StatCard } from './primitives';
import type { MockDefinition } from './types';

const VISITORS = [92, 61, 68, 142, 131, 138, 171, 168];
const VISITORS_PREVIOUS = [4, 6, 38, 60, 120, 128, 126, 110];

const STATS = [
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
  {
    label: 'Live · 30 min',
    value: '14',
    period: 'Right now',
    bars: [2, 3, 2, 4, 3, 5, 4, 6],
  },
];

export function WebOverviewContent() {
  return (
    <>
      <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Unique visitors
        </span>
        <AreaChart
          labels={['Oct 23', 'Oct 25', 'Oct 27', 'Oct 30']}
          primary={VISITORS}
          secondary={VISITORS_PREVIOUS}
        />
      </div>
      <div className="grid @2xl:grid-cols-[1.4fr_1fr] grid-cols-1 gap-3">
        <MockTable
          columns={['Referrer', 'Views', 'Sess.']}
          rows={[
            { cells: ['Google', '3,331', '2,204'], share: 100 },
            { cells: ['Direct / Not set', '2,104', '1,480'], share: 64 },
            { cells: ['Product Hunt', '1,208', '960'], share: 38 },
            { cells: ['X', '771', '552'], share: 24 },
            { cells: ['LinkedIn', '478', '349'], share: 15 },
          ]}
          tabs={['Refs', 'Urls', 'Types', 'Source', 'Medium', 'Campaign']}
        />
        <MockTable
          columns={['Path', 'Views', 'Sess.']}
          rows={[
            { cells: ['/', '4,120', '3,002'], share: 100 },
            { cells: ['/pricing', '1,870', '1,310'], share: 45 },
            { cells: ['/docs/guides/cohorts', '933', '712'], share: 23 },
            { cells: ['/docs/guides/funnels', '611', '480'], share: 15 },
            { cells: ['/articles', '402', '318'], share: 10 },
          ]}
          tabs={['Pages', 'Entries', 'Exits']}
        />
      </div>
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

export const WEB_MOCKS = {
  'web-overview': {
    content: () => <WebOverviewContent />,
    shell: { page: 'overview', project: 'Acme Web' },
    insetWidth: 900,
  },
  seo: {
    content: () => <SeoContent />,
    shell: { page: 'pages', project: 'Acme Web' },
    insetWidth: 900,
  },
} satisfies Record<string, MockDefinition>;
