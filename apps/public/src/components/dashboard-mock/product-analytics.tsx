import { DashboardShell, Toolbar } from './frame';
import { MockTabs, Pill } from './primitives';
import { cn } from '@/lib/utils';

const FUNNEL_STEPS = [
  { label: 'Visited pricing', count: 4210, share: 100 },
  { label: 'Started trial', count: 1390, share: 33 },
  { label: 'Created project', count: 912, share: 21.7 },
  { label: 'Sent first event', count: 640, share: 15.2 },
  { label: 'Upgraded', count: 402, share: 9.5 },
];

const COHORTS = [
  { label: 'Sep 29', size: 1240, weeks: [100, 48, 39, 34, 31, 29] },
  { label: 'Oct 6', size: 1312, weeks: [100, 51, 42, 36, 33] },
  { label: 'Oct 13', size: 1405, weeks: [100, 53, 44, 38] },
  { label: 'Oct 20', size: 1388, weeks: [100, 55, 46] },
  { label: 'Oct 27', size: 1502, weeks: [100, 57] },
];

export function FunnelContent() {
  return (
    <div className="col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="row items-center justify-between">
        <div className="col">
          <span className="font-medium text-[13px]">Trial to paid</span>
          <span className="text-[11px] text-neutral-500">
            Funnel · 5 steps · Last 30 days
          </span>
        </div>
        <div className="row gap-2">
          <Pill>Breakdown: Country</Pill>
          <Pill active>Save report</Pill>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {FUNNEL_STEPS.map((step, index) => (
          <div className="col gap-2" key={step.label}>
            <div className="col h-28 justify-end rounded-md bg-neutral-100 p-1">
              <div
                className="w-full rounded bg-blue-600"
                style={{ height: `${Math.max(step.share, 7)}%` }}
              />
            </div>
            <div className="col">
              <span className="font-mono font-semibold text-[14px]">
                {step.share}%
              </span>
              <span className="truncate text-[11px] text-neutral-700">
                {index + 1}. {step.label}
              </span>
              <span className="font-mono text-[10px] text-neutral-500">
                {step.count.toLocaleString('en-US')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const WEEKS = ['Week 0', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];

export function RetentionContent({ compact = false }: { compact?: boolean }) {
  const weeks = WEEKS.slice(0, compact ? 4 : 6);
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="row items-center justify-between">
        <div className="col">
          <span className="font-medium text-[13px]">Weekly retention</span>
          <span className="text-[11px] text-neutral-500">
            Users who came back, by sign-up week
          </span>
        </div>
      </div>
      <div
        className="grid gap-1 text-[11px]"
        style={{
          gridTemplateColumns: `100px 48px repeat(${weeks.length}, minmax(0, 1fr))`,
        }}
      >
        <span className="text-neutral-500">Cohort</span>
        <span className="text-neutral-500">Users</span>
        {weeks.map((week) => (
          <span className="text-center text-neutral-500" key={week}>
            {week}
          </span>
        ))}
        {COHORTS.map((cohort) => (
          <CohortRow cohort={cohort} key={cohort.label} weeks={weeks} />
        ))}
      </div>
    </div>
  );
}

function CohortRow({
  cohort,
  weeks,
}: {
  cohort: (typeof COHORTS)[number];
  weeks: string[];
}) {
  return (
    <>
      <span className="py-1 font-medium">{cohort.label}</span>
      <span className="py-1 font-mono text-neutral-600">
        {cohort.size.toLocaleString('en-US')}
      </span>
      {weeks.map((week, index) => {
        const value = cohort.weeks[index];
        return (
          <span
            className={cn(
              'center-center rounded py-1 font-mono',
              value === undefined ? 'bg-transparent' : 'text-blue-950'
            )}
            key={`${cohort.label}-${week}`}
            style={
              value === undefined
                ? undefined
                : {
                    backgroundColor: `rgba(37, 99, 235, ${0.08 + (value / 100) * 0.55})`,
                  }
            }
          >
            {value === undefined ? '' : `${value}%`}
          </span>
        );
      })}
    </>
  );
}

export function ProductAnalyticsContent() {
  return (
    <>
      <MockTabs items={['Funnel', 'Retention', 'Line', 'Bar', 'Pie', 'Map']} />
      <FunnelContent />
      <RetentionContent />
    </>
  );
}

export function ProductAnalyticsMock({ className }: { className?: string }) {
  return (
    <DashboardShell
      active="reports"
      className={className}
      project="Acme SaaS"
      toolbar={<Toolbar range="Last 30 days" withAsk={false} />}
      url="/acme/saas/reports"
    >
      <ProductAnalyticsContent />
    </DashboardShell>
  );
}
