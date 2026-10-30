import { DashboardShell, Toolbar } from './frame';
import { AreaChart, MockTable, StatCard } from './primitives';
import { cn } from '@/lib/utils';

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

export function WebOverviewContent({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <div
        className={cn(
          'grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200',
          compact ? 'grid-cols-2' : 'grid-cols-4'
        )}
      >
        {STATS.slice(0, compact ? 4 : 8).map((stat) => (
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
      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
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

export function WebOverviewMock({ className }: { className?: string }) {
  return (
    <DashboardShell
      active="overview"
      className={className}
      project="Acme Web"
      toolbar={<Toolbar />}
      url="/acme/web"
    >
      <WebOverviewContent />
    </DashboardShell>
  );
}
