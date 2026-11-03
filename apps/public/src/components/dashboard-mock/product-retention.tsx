import { PlusIcon } from 'lucide-react';
import {
  AreaChart,
  FilterChip,
  HeatGrid,
  MockBadge,
  Pill,
  Toggle,
} from './primitives';
import {
  FormField,
  FormInput,
  FormSelect,
  MockSheet,
  SegmentedControl,
} from './primitives-ui';
import { BuilderSection, ReportFrame, SettingRow } from './report-frame';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// The Retention chart type (curve plus cohort grid) and the cohort builder.

const WEEK_COLUMNS = [
  '< week 1',
  'week 1',
  'week 2',
  'week 3',
  'week 4',
  'week 5',
];
const CURVE = [100, 53, 43, 37, 33, 31];
const AVERAGE = 34;

const COHORTS = [
  { label: 'Sep 29', size: '1,240', values: [100, 48, 39, 34, 31, 29] },
  { label: 'Oct 6', size: '1,312', values: [100, 51, 42, 36, 33] },
  { label: 'Oct 13', size: '1,405', values: [100, 53, 44, 38] },
  { label: 'Oct 20', size: '1,388', values: [100, 55, 46] },
  { label: 'Oct 27', size: '1,502', values: [100, 57] },
];

const WEIGHTED_AVERAGE = {
  label: 'Weighted Average',
  size: '6,847',
  values: [100, 52, 43, 36, 32, 29],
  emphasis: true,
};

export function RetentionGrid({
  columns = WEEK_COLUMNS,
  cohorts = COHORTS,
  compact = false,
}: {
  columns?: string[];
  cohorts?: typeof COHORTS;
  compact?: boolean;
}) {
  const shown = compact ? columns.slice(0, 4) : columns;
  return (
    <HeatGrid
      columns={shown}
      rowLabel="Cohort"
      rows={[WEIGHTED_AVERAGE, ...cohorts].map((row) => ({
        ...row,
        values: row.values.slice(0, shown.length),
      }))}
      sizeLabel="Total profiles"
    />
  );
}

export function EventChips({ names }: { names: string[] }) {
  return (
    <span className="row flex-wrap items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-1">
      {names.map((name) => (
        <MockBadge key={name} tone="blue">
          <span className="font-mono">{name}</span>
        </MockBadge>
      ))}
      <PlusIcon className="size-3 text-neutral-400" />
    </span>
  );
}

function RetentionBuilder() {
  return (
    <>
      <BuilderSection title="Metrics">
        <span className="text-[11px] text-neutral-500">Start event</span>
        <EventChips names={['sign_up', 'trial_started']} />
        <span className="text-[11px] text-neutral-500">Return event</span>
        <EventChips names={['project_created']} />
      </BuilderSection>
      <BuilderSection title="Settings">
        <SettingRow label="Criteria">
          <SegmentedControl items={['On or After', 'On']} />
        </SettingRow>
        <SettingRow label="Unit">
          <SegmentedControl active={1} items={['Count', '%']} />
        </SettingRow>
      </BuilderSection>
    </>
  );
}

export function RetentionCurve({ height = 130 }: { height?: number }) {
  return (
    <div className="col relative gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="row items-center justify-between text-[11px] text-neutral-600">
        <span>Retention rate per week</span>
        <span className="rounded bg-white px-1 font-mono text-[10px] ring-1 ring-neutral-200">
          Average ({AVERAGE}%)
        </span>
      </div>
      <AreaChart
        height={height}
        labels={['week 0', 'week 1', 'week 2', 'week 3', 'week 4', 'week 5']}
        primary={CURVE}
      />
    </div>
  );
}

// The chart panel on its own, as the homepage pillar shows it.
export function RetentionContent({ compact = false }: { compact?: boolean }) {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="col">
        <span className="font-medium text-[13px]">Weekly retention</span>
        <span className="text-[11px] text-neutral-500">
          Users who came back, by sign-up week
        </span>
      </div>
      <RetentionGrid compact={compact} />
    </div>
  );
}

export function RetentionReport() {
  return (
    <ReportFrame
      builder={<RetentionBuilder />}
      name="Weekly retention"
      range="Last 3 months"
      type="Retention"
    >
      <RetentionCurve />
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <RetentionGrid />
      </div>
    </ReportFrame>
  );
}

export function RetentionGridView() {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="row items-center gap-3 text-[11px] text-neutral-600">
        <span className="font-medium text-[13px] text-neutral-900">
          Weekly retention
        </span>
        <span className="row ml-auto items-center gap-2">
          Criteria <SegmentedControl items={['On or After', 'On']} />
        </span>
      </div>
      <RetentionGrid />
      <span className="text-[10.5px] text-neutral-500">
        The weighted average only counts cells whose week has passed.
      </span>
    </div>
  );
}

export function RetentionSetupView() {
  return (
    <>
      <div className="row items-center gap-2">
        {['Minute', 'Hour', 'Day', 'Week', 'Month'].map((interval) => (
          <Pill active={interval === 'Week'} key={interval}>
            {interval}
          </Pill>
        ))}
      </div>
      <div className="grid @xl:grid-cols-[1.1fr_1fr] grid-cols-1 gap-3">
        <div className="col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
          <span className="font-medium text-[12px]">Report builder</span>
          <RetentionBuilder />
        </div>
        <RetentionCurve height={110} />
      </div>
    </>
  );
}

const FILTERED_COHORTS = [
  { label: 'Oct 6', size: '212', values: [100, 61, 52, 47, 44] },
  { label: 'Oct 13', size: '240', values: [100, 63, 55, 49] },
  { label: 'Oct 20', size: '198', values: [100, 66, 57] },
  { label: 'Oct 27', size: '251', values: [100, 68] },
];

export function RetentionFilteredView() {
  return (
    <>
      <div className="row flex-wrap items-center gap-2">
        <FilterChip field="plan" value="Pro" />
        <FilterChip
          field="Cohort"
          operator="in cohort"
          value="Signed up from Product Hunt"
        />
        <Pill>+ Add filter</Pill>
      </div>
      <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <RetentionGrid
          cohorts={FILTERED_COHORTS}
          columns={WEEK_COLUMNS.slice(0, 5)}
        />
      </div>
    </>
  );
}

export function CohortBuilder() {
  return (
    <MockSheet
      description="Group people by what they did or who they are, then filter any report or funnel by that group."
      footer={
        <>
          <Pill>Cancel</Pill>
          <Pill active>Create cohort</Pill>
        </>
      }
      title="Create cohort"
      width={380}
    >
      <FormField label="Name">
        <FormInput value="Signed up from Product Hunt" />
      </FormField>
      <FormField label="Description">
        <FormInput placeholder="Optional" />
      </FormField>
      <div className="row items-center justify-between text-[12px]">
        <span className="text-neutral-700">
          Freeze snapshot (don't auto-refresh)
        </span>
        <Toggle on={false} />
      </div>
      <div className="col gap-3 rounded-lg border border-neutral-200 p-3">
        <div className="row items-center justify-between">
          <span className="font-medium text-[12px]">Cohort Criteria</span>
          <SegmentedControl items={['Event-based', 'Property-based']} />
        </div>
        <SettingRow label="Match">
          <FormSelect className="w-40" value="Any of these events" />
        </SettingRow>
        <div className="col gap-2 rounded-md bg-neutral-50 p-2 text-[11.5px]">
          <div className="row items-center gap-2">
            <span className="text-neutral-500">Event</span>
            <MockBadge tone="blue">
              <span className="font-mono">sign_up</span>
            </MockBadge>
            <span className="ml-auto text-neutral-500">
              referrer_name is Product Hunt
            </span>
          </div>
          <div className="row items-center gap-2">
            <span className="text-neutral-500">Frequency</span>
            <FormSelect className="h-7 w-24" value="At least" />
            <FormInput className="h-7 w-10 justify-center" mono value="1" />
            <span className="text-neutral-500">times</span>
          </div>
          <div className="row items-center gap-2">
            <span className="text-neutral-500">Timeframe</span>
            <FormSelect className="h-7 w-20" value="Last" />
            <FormSelect className="h-7 w-24" value="30 days" />
          </div>
        </div>
        <span className="row items-center gap-1 text-[11px] text-neutral-500">
          <PlusIcon className="size-3" /> Add event
        </span>
      </div>
    </MockSheet>
  );
}

export function MiniTwoEvents() {
  return (
    <div className="col gap-2 text-[11px] text-neutral-500">
      <span>Start event</span>
      <EventChips names={['sign_up', 'trial_started']} />
      <span>Return event</span>
      <EventChips names={['project_created']} />
    </div>
  );
}

export function MiniCriteria() {
  return (
    <div className="col gap-3 text-[11.5px]">
      <SettingRow label="Criteria">
        <SegmentedControl items={['On or After', 'On']} />
      </SettingRow>
      <p className="text-neutral-500">
        "On or After" counts a user as retained in week 3 if they came back in
        week 3 or any later week. "On" needs week 3 itself.
      </p>
    </div>
  );
}

export function MiniUnit() {
  return (
    <div className="col gap-3 text-[11.5px]">
      <SettingRow label="Unit">
        <SegmentedControl active={1} items={['Count', '%']} />
      </SettingRow>
      <HeatGrid
        columns={['week 1', 'week 2']}
        rows={[
          { label: 'Oct 13', size: '1,405', values: [53, 44] },
          { label: 'Oct 20', size: '1,388', values: [55, 46] },
        ]}
        sizeLabel="Profiles"
      />
    </div>
  );
}

export function MiniWeightedAverage() {
  return (
    <HeatGrid
      columns={['week 1', 'week 2', 'week 3']}
      rows={[
        { ...WEIGHTED_AVERAGE, values: [52, 43, 36] },
        { label: 'Oct 13', size: '1,405', values: [53, 44, 38] },
        { label: 'Oct 20', size: '1,388', values: [55, 46] },
        { label: 'Oct 27', size: '1,502', values: [57] },
      ]}
      sizeLabel="Profiles"
    />
  );
}

export function MiniCohortCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[11.5px]">
      <div className="row items-center justify-between">
        <span className="font-medium text-[12.5px]">
          Signed up from Product Hunt
        </span>
        <MockBadge>Static</MockBadge>
      </div>
      <span className="text-neutral-500">
        Did sign_up at least once in the last 30 days
      </span>
      <div className="row items-center gap-3 text-neutral-500">
        <span className="font-mono text-neutral-900">1,204 members</span>
        <span>Updated Oct 30, 09:12</span>
      </div>
    </div>
  );
}

export const RETENTION_MOCKS = {
  retention: {
    content: () => <RetentionReport />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 3 months' },
    insetWidth: 900,
  },
  'retention-grid': {
    content: () => <RetentionGridView />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 3 months' },
    insetWidth: 820,
  },
  'retention-setup': {
    content: () => <RetentionSetupView />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 3 months' },
    insetWidth: 820,
  },
  'retention-filtered': {
    content: () => <RetentionFilteredView />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 3 months' },
    insetWidth: 760,
  },
  'mini-two-events': { content: () => <MiniTwoEvents /> },
  'mini-criteria': { content: () => <MiniCriteria /> },
  'mini-unit': { content: () => <MiniUnit /> },
  'mini-weighted-average': { content: () => <MiniWeightedAverage /> },
} satisfies Record<string, MockDefinition>;

export const COHORT_MOCKS = {
  'cohort-builder': {
    content: () => (
      <div className={cn('row justify-center py-2')}>
        <CohortBuilder />
      </div>
    ),
    shell: { page: 'cohorts', project: 'Acme SaaS' },
    insetWidth: 760,
  },
  'mini-cohort-card': { content: () => <MiniCohortCard /> },
} satisfies Record<string, MockDefinition>;
