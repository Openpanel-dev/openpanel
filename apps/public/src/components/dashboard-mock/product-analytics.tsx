import { UsersIcon } from 'lucide-react';
import {
  Avatar,
  HeatGrid,
  MockBadge,
  MockTabs,
  Pill,
  Toggle,
} from './primitives';
import { FormInput, MockModal, SegmentedControl } from './primitives-ui';
import { CONVERSION_MOCKS } from './product-conversion';
import {
  COHORT_MOCKS,
  RETENTION_MOCKS,
  RetentionContent,
} from './product-retention';
import {
  BuilderSection,
  ReportFrame,
  SeriesRow,
  SettingRow,
} from './report-frame';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// The report editor and the funnel chart type. Conversion and retention
// live in their own files; the registry at the bottom joins them.

export const FUNNEL_STEPS = [
  {
    letter: 'A',
    label: 'Visited pricing',
    count: 4210,
    dropped: 2820,
    share: 100,
  },
  { letter: 'B', label: 'Started trial', count: 1390, dropped: 478, share: 33 },
  {
    letter: 'C',
    label: 'Created project',
    count: 912,
    dropped: 272,
    share: 21.7,
  },
  {
    letter: 'D',
    label: 'Sent first event',
    count: 640,
    dropped: 238,
    share: 15.2,
  },
  { letter: 'E', label: 'Upgraded', count: 402, dropped: 0, share: 9.5 },
];

const BIGGEST_DROP = FUNNEL_STEPS.reduce((max, step) =>
  step.dropped > max.dropped ? step : max
);

function format(value: number) {
  return value.toLocaleString('en-US');
}

// ----- Funnel pieces --------------------------------------------------------

function FunnelBuilder({ breakdown }: { breakdown?: string }) {
  return (
    <>
      <BuilderSection title="Metrics">
        {FUNNEL_STEPS.map((step) => (
          <SeriesRow
            filters={step.letter === 'A' ? 'path is /pricing' : undefined}
            key={step.letter}
            letter={step.letter}
            name={step.label.toLowerCase().replaceAll(' ', '_')}
          />
        ))}
      </BuilderSection>
      <BuilderSection title="Breakdown">
        <span className="rounded-md bg-neutral-100 px-2 py-1.5 text-[11.5px] text-neutral-600">
          {breakdown ?? 'Add breakdown'}
        </span>
      </BuilderSection>
      <BuilderSection title="Settings">
        <SettingRow label="Funnel Group">
          <SegmentedControl items={['Session', 'Profile']} />
        </SettingRow>
        <SettingRow label="Funnel Window">
          <span className="font-mono text-neutral-800">24 h</span>
        </SettingRow>
        <SettingRow label="Compare to previous period">
          <Toggle />
        </SettingRow>
      </BuilderSection>
    </>
  );
}

export function FunnelShape({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {FUNNEL_STEPS.map((step) => (
        <div className="col gap-2" key={step.letter}>
          <div
            className={cn(
              'col justify-end rounded-md bg-neutral-100 p-1',
              compact ? 'h-20' : 'h-28'
            )}
          >
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
              {step.letter}. {step.label}
            </span>
            <span className="font-mono text-[10px] text-neutral-500">
              {format(step.count)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  change,
}: {
  label: string;
  value: string;
  detail?: string;
  change?: string;
}) {
  return (
    <div className="col gap-0.5 bg-white p-3">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="row items-baseline gap-2">
        <span className="font-mono font-semibold text-[18px] tracking-tight">
          {value}
        </span>
        {change && (
          <span className="font-medium text-[11px] text-emerald-600">
            ↑ {change}
          </span>
        )}
      </span>
      {detail && (
        <span className="truncate text-[11px] text-neutral-500">{detail}</span>
      )}
    </div>
  );
}

export function FunnelStatStrip() {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
      <Stat change="1.4%" label="Conversion" value="9.5%" />
      <Stat change="38" label="Completed" value="402" />
      <Stat
        detail={`${format(BIGGEST_DROP.dropped)} dropped after this step`}
        label="Most drop-offs after"
        value={BIGGEST_DROP.label}
      />
    </div>
  );
}

export function FunnelStepsTable({
  withUsers = true,
}: {
  withUsers?: boolean;
}) {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_minmax(0,1.2fr)_auto] gap-x-4 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        <span>Step</span>
        <span className="text-right">Completed</span>
        <span className="text-right">Dropped after</span>
        <span className="text-right">Conversion</span>
        <span />
      </div>
      {FUNNEL_STEPS.map((step) => (
        <div
          className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_minmax(0,1.2fr)_auto] items-center gap-x-4 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
          key={step.letter}
        >
          <span className="row items-center gap-2 truncate">
            <span className="center-center size-4 rounded bg-neutral-100 font-mono text-[9px]">
              {step.letter}
            </span>
            {step.label}
          </span>
          <span className="text-right font-mono">{format(step.count)}</span>
          <span
            className={cn(
              'text-right font-mono',
              step === BIGGEST_DROP
                ? 'font-semibold text-red-600'
                : 'text-neutral-600'
            )}
          >
            {step.dropped ? format(step.dropped) : '–'}
          </span>
          <span className="row items-center justify-end gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-100">
              <span
                className="block h-full rounded-full bg-blue-600"
                style={{ width: `${step.share}%` }}
              />
            </span>
            <span className="w-11 text-right font-mono">{step.share}%</span>
          </span>
          {withUsers ? (
            <UsersIcon className="size-3.5 text-neutral-400" />
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}

// The chart panel on its own, as the homepage pillar shows it.
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
      <FunnelShape />
    </div>
  );
}

export function FunnelReport() {
  return (
    <ReportFrame builder={<FunnelBuilder />} name="Trial to paid" type="Funnel">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <FunnelShape />
      </div>
      <FunnelStatStrip />
      <FunnelStepsTable />
    </ReportFrame>
  );
}

export function FunnelSteps() {
  return (
    <>
      <FunnelStatStrip />
      <FunnelStepsTable />
    </>
  );
}

const BREAKDOWN_ROWS = [
  {
    name: 'United States',
    conversion: 11.2,
    completed: 188,
    drop: 'Visited pricing',
    steps: [100, 36, 24, 17, 11.2],
  },
  {
    name: 'Sweden',
    conversion: 14.2,
    completed: 64,
    drop: 'Started trial',
    steps: [100, 41, 29, 20, 14.2],
  },
  {
    name: 'Germany',
    conversion: 8.9,
    completed: 52,
    drop: 'Visited pricing',
    steps: [100, 30, 20, 13, 8.9],
  },
  {
    name: 'United Kingdom',
    conversion: 7.4,
    completed: 41,
    drop: 'Visited pricing',
    steps: [100, 28, 18, 11, 7.4],
  },
  {
    name: 'France',
    conversion: 6.1,
    completed: 23,
    drop: 'Created project',
    steps: [100, 31, 16, 9, 6.1],
  },
];

const SERIES_COLOURS = ['bg-blue-600', 'bg-blue-400', 'bg-blue-200'];

export function FunnelBreakdown() {
  const shown = BREAKDOWN_ROWS.slice(0, 3);
  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <Stat detail="Sweden" label="Highest conversion rate" value="14.2%" />
        <Stat detail="United States" label="Most conversions" value="188" />
      </div>
      <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="row items-center gap-3 text-[11px] text-neutral-600">
          {shown.map((row, index) => (
            <span className="row items-center gap-1.5" key={row.name}>
              <span
                className={cn('size-2 rounded-sm', SERIES_COLOURS[index])}
              />
              {row.name}
            </span>
          ))}
          <span className="text-neutral-400">+7 more</span>
          <span className="ml-auto">Breakdown: Country · From step A</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {FUNNEL_STEPS.map((step, stepIndex) => (
            <div className="col gap-1.5" key={step.letter}>
              <div className="row h-20 items-end gap-1 rounded-md bg-neutral-100 p-1">
                {shown.map((row, index) => (
                  <div
                    className={cn('flex-1 rounded-sm', SERIES_COLOURS[index])}
                    key={row.name}
                    style={{ height: `${Math.max(row.steps[stepIndex], 6)}%` }}
                  />
                ))}
              </div>
              <span className="truncate text-[10.5px] text-neutral-600">
                {step.letter}. {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="col min-w-[620px] overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_auto_minmax(0,1.3fr)_repeat(5,40px)] gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          <span>Breakdown</span>
          <span>Conversion</span>
          <span className="text-right">Completed</span>
          <span>Most drop-off after</span>
          {FUNNEL_STEPS.map((step) => (
            <span className="text-center" key={step.letter}>
              {step.letter}
            </span>
          ))}
        </div>
        {BREAKDOWN_ROWS.map((row, index) => (
          <div
            className={cn(
              'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_auto_minmax(0,1.3fr)_repeat(5,40px)] items-center gap-x-3 border-neutral-100 border-b px-3 py-1.5 text-[11.5px] last:border-b-0',
              index === 0 && 'bg-blue-50/50'
            )}
            key={row.name}
          >
            <span className="truncate">{row.name}</span>
            <span className="row items-center gap-2">
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-100">
                <span
                  className="block h-full rounded-full bg-blue-600"
                  style={{ width: `${row.conversion * 6}%` }}
                />
              </span>
              <span className="font-mono">{row.conversion}%</span>
            </span>
            <span className="text-right font-mono">{row.completed}</span>
            <span className="truncate text-neutral-600">{row.drop}</span>
            {row.steps.map((value, stepIndex) => (
              <span
                className="center-center rounded py-0.5 font-mono text-[10.5px] text-blue-950"
                key={FUNNEL_STEPS[stepIndex].letter}
                style={{
                  backgroundColor: `rgba(37, 99, 235, ${0.08 + (value / 100) * 0.55})`,
                }}
              >
                {value}%
              </span>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

const DROPPED_USERS = [
  {
    initials: 'ML',
    name: 'Mia Lund',
    detail: 'mia@northwind.io · Berlin',
    when: '2 h ago',
  },
  {
    initials: 'JK',
    name: 'Jonas Kim',
    detail: 'jonas@acme.dev · Austin',
    when: '5 h ago',
  },
  {
    initials: 'SB',
    name: 'Sara Brandt',
    detail: 'Anonymous · Lisbon',
    when: 'Yesterday',
  },
  {
    initials: 'TP',
    name: 'Tomás Pérez',
    detail: 'tomas@latam.app · Madrid',
    when: 'Yesterday',
  },
  {
    initials: 'AN',
    name: 'Anonymous',
    detail: 'Mobile · Tokyo',
    when: 'Oct 28',
  },
];

export function FunnelUsers() {
  return (
    <div className="relative">
      <div className="opacity-60">
        <FunnelStepsTable />
      </div>
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <MockModal
          description="Users who dropped off after step 2 of 5"
          title="View Users"
          width={420}
        >
          <SegmentedControl active={1} items={['Completed', 'Dropped Off']} />
          <div className="col -mx-1">
            {DROPPED_USERS.slice(0, 3).map((user) => (
              <div
                className="row items-center gap-3 rounded-md px-1 py-1.5 text-[12px] hover:bg-neutral-50"
                key={user.name + user.detail}
              >
                <Avatar initials={user.initials} />
                <span className="col min-w-0">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-[11px] text-neutral-500">
                    {user.detail}
                  </span>
                </span>
                <span className="ml-auto text-[11px] text-neutral-500">
                  {user.when}
                </span>
              </div>
            ))}
          </div>
        </MockModal>
      </div>
    </div>
  );
}

// ----- Minis for the cards --------------------------------------------------

export function MiniFunnelToggle() {
  return (
    <div className="col gap-3">
      <SegmentedControl items={['Session', 'Profile']} />
      <div className="row items-baseline gap-3">
        <span className="font-mono font-semibold text-2xl">9.5%</span>
        <span className="text-[11px] text-neutral-500">per session</span>
      </div>
      <div className="row items-baseline gap-3 opacity-60">
        <span className="font-mono font-semibold text-2xl">12.8%</span>
        <span className="text-[11px] text-neutral-500">
          per profile, same funnel
        </span>
      </div>
    </div>
  );
}

export function MiniStepPicker() {
  return (
    <div className="col gap-1.5">
      {FUNNEL_STEPS.slice(0, 4).map((step) => (
        <SeriesRow
          key={step.letter}
          letter={step.letter}
          name={step.label.toLowerCase().replaceAll(' ', '_')}
        />
      ))}
    </div>
  );
}

export function MiniFunnelWindow() {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <SettingRow label="Funnel Window">
        <FormInput className="h-7 w-20 justify-end" mono value="72" />
      </SettingRow>
      <span className="text-[10.5px] text-neutral-500">
        Hours. Default: 24h
      </span>
      <SettingRow label="Funnel Group">
        <SegmentedControl active={1} items={['Session', 'Profile']} />
      </SettingRow>
    </div>
  );
}

export function MiniCompare() {
  return (
    <div className="col gap-2">
      <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
        Conversion
      </span>
      <span className="row items-baseline gap-2">
        <span className="font-mono font-semibold text-2xl">9.5%</span>
        <span className="font-medium text-[11px] text-emerald-600">↑ 1.4%</span>
      </span>
      <span className="text-[11px] text-neutral-500">previous period 8.1%</span>
      <div className="row items-end gap-1">
        {[6, 7, 7, 8, 9, 9, 10, 11].map((value, index) => (
          <span
            className="row flex-1 items-end gap-0.5"
            // biome-ignore lint/suspicious/noArrayIndexKey: static bars
            key={index}
          >
            <span
              className="flex-1 rounded-t-sm bg-blue-600"
              style={{ height: value * 3 }}
            />
            <span
              className="flex-1 rounded-t-sm bg-blue-600/25"
              style={{ height: Math.max(value - 1, 3) * 3 }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniCohortFilter() {
  return (
    <div className="col gap-2 text-[11.5px]">
      <span className="text-neutral-500">Step B · filters</span>
      <span className="row items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
        <span className="text-neutral-500">Cohort</span>
        <span className="text-neutral-400">In cohort</span>
        <MockBadge tone="blue">Product Hunt sign-ups</MockBadge>
      </span>
      <span className="row items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
        <span className="text-neutral-500">plan</span>
        <span className="text-neutral-400">is</span>
        <span className="font-medium">pro</span>
      </span>
      <span className="text-neutral-500">Breakdown · Cohort</span>
    </div>
  );
}

export function MiniReportActions() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[11.5px]">
      <MockTabs active={1} items={['Chart', 'Table']} />
      <HeatGrid
        columns={['A', 'B', 'C']}
        rowLabel="Report"
        rows={[
          { label: 'Trial to paid', values: [100, 33, 21.7] },
          { label: 'Shop checkout', values: [100, 48, 31] },
        ]}
      />
      <div className="row gap-2 pt-1">
        <Pill>Export CSV</Pill>
        <Pill>Add to dashboard</Pill>
      </div>
    </div>
  );
}

export const PRODUCT_MOCKS = {
  product: {
    content: () => (
      <>
        <FunnelContent />
        <RetentionContent />
      </>
    ),
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 900,
  },
  funnel: {
    content: () => <FunnelReport />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 900,
  },
  'funnel-steps': {
    content: () => <FunnelSteps />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 760,
  },
  'funnel-breakdown': {
    content: () => <FunnelBreakdown />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 860,
  },
  'funnel-users': {
    content: () => <FunnelUsers />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 760,
  },
  'mini-funnel-toggle': { content: () => <MiniFunnelToggle /> },
  'mini-step-picker': { content: () => <MiniStepPicker /> },
  'mini-funnel-window': { content: () => <MiniFunnelWindow /> },
  'mini-compare': { content: () => <MiniCompare /> },
  'mini-cohort-filter': { content: () => <MiniCohortFilter /> },
  'mini-report-actions': { content: () => <MiniReportActions /> },
  ...CONVERSION_MOCKS,
  ...RETENTION_MOCKS,
  ...COHORT_MOCKS,
} satisfies Record<string, MockDefinition>;
