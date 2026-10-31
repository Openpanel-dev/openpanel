import { AlertTriangleIcon, CheckIcon } from 'lucide-react';
import { ChatInappContent, ChatMock } from './chat';
import {
  AreaChart,
  Avatar,
  MockBadge,
  MockTable,
  MockTabs,
  Panel,
  StatCard,
  Toggle,
} from './primitives';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

const COST = [21, 18, 24, 31, 44, 52, 48, 61];
const COST_PREVIOUS = [12, 15, 14, 20, 26, 30, 29, 33];

const STATS = [
  {
    label: 'Cost',
    value: '$412.30',
    change: '11.2%',
    negative: true,
    bars: [4, 3, 4, 5, 7, 8, 7, 9],
  },
  {
    label: 'Generations',
    value: '84,120',
    change: '82.6%',
    bars: [4, 3, 3, 5, 7, 8, 6, 8],
  },
  {
    label: 'Users',
    value: '2,418',
    change: '18.2%',
    bars: [3, 3, 4, 5, 6, 7, 6, 8],
  },
  {
    label: 'Cost per user',
    value: '$0.17',
    change: '3.2%',
    bars: [5, 5, 5, 5, 6, 5, 5, 5],
  },
  {
    label: 'Input tokens',
    value: '19.9M',
    change: '90.7%',
    bars: [4, 3, 4, 6, 7, 8, 7, 9],
  },
  {
    label: 'Output tokens',
    value: '2.5M',
    change: '119%',
    bars: [3, 3, 4, 6, 7, 8, 7, 9],
  },
  {
    label: 'Latency p95',
    value: '4.9',
    unit: 's',
    change: '27.4%',
    negative: true,
    bars: [5, 5, 6, 6, 7, 7, 8, 8],
  },
  {
    label: 'Error rate',
    value: '3.6',
    unit: '%',
    change: '44.6%',
    bars: [8, 6, 5, 4, 4, 3, 3, 2],
  },
];

const GENERATIONS = [
  {
    user: 'AS',
    feature: 'Summarize ticket',
    model: 'claude-sonnet-5-5',
    tokens: '3,104',
    cost: '$0.004',
    latency: '1.2s',
  },
  {
    user: 'ML',
    feature: 'Draft reply',
    model: 'gpt-5',
    tokens: '8,920',
    cost: '$0.011',
    latency: '2.8s',
  },
  {
    user: 'JK',
    feature: 'Classify intent',
    model: 'gpt-5-mini',
    tokens: '640',
    cost: '$0.001',
    latency: '0.4s',
  },
  {
    user: 'SB',
    feature: 'Draft reply',
    model: 'gpt-5',
    tokens: '0',
    cost: '$0.000',
    latency: 'Timed out',
    failed: true,
  },
  {
    user: 'TP',
    feature: 'Search docs',
    model: 'claude-haiku-5-5',
    tokens: '1,210',
    cost: '$0.001',
    latency: '0.6s',
  },
];

export function AiOverviewContent({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <div className="col gap-0.5">
        <span className="row items-center gap-2 font-semibold text-[15px]">
          AI
          <span className="rounded border border-neutral-200 px-1.5 py-0.5 font-normal text-[10px] text-neutral-500">
            Beta
          </span>
        </span>
        <span className="text-[12px] text-neutral-500">
          Every model call your product makes: cost, tokens, latency and errors,
          tied to the profiles and sessions behind them
        </span>
      </div>
      <MockTabs items={['Overview', 'Traces', 'Generations']} />
      <div className="grid @2xl:grid-cols-4 grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {STATS.slice(0, compact ? 4 : 8).map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <div className="grid @2xl:grid-cols-[1.3fr_1fr] grid-cols-1 gap-3">
        <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
            Cost
          </span>
          <AreaChart
            height={120}
            labels={['Oct 23', 'Oct 25', 'Oct 27', 'Oct 30']}
            primary={COST}
            secondary={COST_PREVIOUS}
          />
        </div>
        <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <span className="border-neutral-200 border-b px-3 py-2.5 font-medium text-[12px]">
            Latest generations
          </span>
          {GENERATIONS.map((row) => (
            <div
              className="row items-center gap-2.5 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
              key={`${row.user}-${row.feature}`}
            >
              <Avatar initials={row.user} />
              <span className="col min-w-0 flex-1">
                <span className="truncate font-medium">{row.feature}</span>
                <span className="truncate font-mono text-[10px] text-neutral-500">
                  {row.model}
                </span>
              </span>
              <span
                className={cn(
                  'row items-center gap-1 text-[11px]',
                  row.failed ? 'text-red-600' : 'text-neutral-500'
                )}
              >
                {row.failed ? (
                  <AlertTriangleIcon className="size-3" />
                ) : (
                  <CheckIcon className="size-3 text-emerald-600" />
                )}
                {row.latency}
              </span>
              <span className="w-12 text-right font-mono text-[12px]">
                {row.cost}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const COST_BY_MODEL = [
  { cells: ['claude-sonnet-5-5', '$214.10', '31.2K'], share: 100 },
  { cells: ['gpt-5', '$118.40', '12.8K'], share: 55 },
  { cells: ['gpt-5-mini', '$41.20', '28.1K'], share: 19 },
  { cells: ['claude-haiku-5-5', '$38.60', '12.0K'], share: 18 },
];

const COST_BY_FEATURE = [
  { cells: ['draft-reply', '$188.30', '2,118'], share: 100 },
  { cells: ['summarize-ticket', '$131.90', '1,904'], share: 70 },
  { cells: ['search-docs', '$52.70', '640'], share: 28 },
  { cells: ['classify-intent', '$39.40', '2,210'], share: 21 },
];

const TOP_USERS = [
  {
    initials: 'AS',
    name: 'Ada Svensson',
    plan: 'Pro',
    cost: '$12.40',
    generations: '1,204',
  },
  {
    initials: 'ML',
    name: 'Marc Lemoine',
    plan: 'Team',
    cost: '$9.80',
    generations: '812',
  },
  {
    initials: 'JK',
    name: 'Jun Kim',
    plan: 'Pro',
    cost: '$7.10',
    generations: '640',
  },
  {
    initials: 'SB',
    name: 'Sofia Barros',
    plan: 'Free',
    cost: '$4.90',
    generations: '512',
  },
];

export function AiCostContent() {
  return (
    <>
      <MockTabs items={['Overview', 'Traces', 'Generations']} />
      <div className="grid @2xl:grid-cols-2 grid-cols-1 gap-3">
        <MockTable
          columns={['Model', 'Cost', 'Calls']}
          rows={COST_BY_MODEL}
          title="Cost by model"
        />
        <MockTable
          columns={['Feature', 'Cost', 'Calls']}
          rows={COST_BY_FEATURE}
          title="Cost by feature"
        />
      </div>
      <Panel padded={false} title="Top users">
        <div className="col px-3 pb-2">
          {TOP_USERS.map((user) => (
            <div
              className="row items-center gap-2.5 border-neutral-100 border-b py-2 text-[12px] last:border-b-0"
              key={user.name}
            >
              <Avatar initials={user.initials} />
              <span className="font-medium">{user.name}</span>
              <MockBadge>{user.plan}</MockBadge>
              <span className="ml-auto font-mono text-neutral-500">
                {user.generations} calls
              </span>
              <span className="w-14 text-right font-mono">{user.cost}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

const TRACE_STEPS = [
  {
    name: 'support-agent',
    kind: 'trace',
    start: 0,
    width: 100,
    duration: '6.4s',
    cost: '$0.021',
  },
  {
    name: 'classify-intent',
    kind: 'generation',
    start: 1,
    width: 7,
    duration: '0.4s',
    cost: '$0.001',
    model: 'gpt-5-mini',
  },
  { name: 'search_docs', kind: 'tool', start: 9, width: 14, duration: '0.9s' },
  {
    name: 'embed-query',
    kind: 'embedding',
    start: 9,
    width: 5,
    duration: '0.3s',
    cost: '$0.000',
  },
  {
    name: 'draft-reply',
    kind: 'generation',
    start: 25,
    width: 48,
    duration: '3.1s',
    cost: '$0.014',
    model: 'claude-sonnet-5-5',
  },
  { name: 'send_reply', kind: 'tool', start: 75, width: 6, duration: '0.4s' },
  {
    name: 'review-tone',
    kind: 'generation',
    start: 83,
    width: 16,
    duration: '1.0s',
    cost: '$0.006',
    model: 'claude-haiku-5-5',
    failed: true,
  },
];

const KIND_TONE = {
  trace: 'neutral',
  generation: 'blue',
  embedding: 'blue',
  tool: 'emerald',
} as const;

export function AiTraceContent() {
  return (
    <>
      <MockTabs active={1} items={['Overview', 'Traces', 'Generations']} />
      <Panel padded={false}>
        <div className="row items-center justify-between border-neutral-200 border-b px-3 py-2.5">
          <span className="col">
            <span className="font-medium text-[13px]">support-agent</span>
            <span className="text-[11px] text-neutral-500">
              Ada Svensson · 7 steps · 2 models · 6.4s · $0.021
            </span>
          </span>
          <MockBadge tone="red">1 error</MockBadge>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(140px,44%)_56px] gap-x-3 px-3 py-1.5 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          <span>Step</span>
          <span>Timeline</span>
          <span className="text-right">Cost</span>
        </div>
        {TRACE_STEPS.map((step, index) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_minmax(140px,44%)_56px] items-center gap-x-3 border-neutral-100 border-t px-3 py-1.5 text-[12px]"
            key={step.name}
            style={{ paddingLeft: index === 0 ? 12 : 24 }}
          >
            <span className="row min-w-0 items-center gap-2">
              <MockBadge
                tone={
                  step.failed
                    ? 'red'
                    : KIND_TONE[step.kind as keyof typeof KIND_TONE]
                }
              >
                {step.kind}
              </MockBadge>
              <span className="truncate font-mono">{step.name}</span>
              {step.model && (
                <span className="truncate text-[10.5px] text-neutral-400">
                  {step.model}
                </span>
              )}
            </span>
            <span className="relative h-4 rounded bg-neutral-100">
              <span
                className={cn(
                  'absolute inset-y-0.5 rounded-sm',
                  step.failed
                    ? 'bg-red-500'
                    : step.kind === 'tool'
                      ? 'bg-emerald-500'
                      : 'bg-blue-600',
                  step.kind === 'trace' && 'bg-neutral-300'
                )}
                style={{ left: `${step.start}%`, width: `${step.width}%` }}
              />
              <span className="absolute inset-y-0 right-1 font-mono text-[10px] text-neutral-500 leading-4">
                {step.duration}
              </span>
            </span>
            <span className="text-right font-mono text-neutral-600">
              {step.cost ?? ''}
            </span>
          </div>
        ))}
      </Panel>
    </>
  );
}

const PRICE_CATALOG = [
  { model: 'claude-sonnet-5-5', price: '$3.00 / $15.00' },
  { model: 'gpt-5', price: '$1.25 / $10.00' },
  { model: 'gpt-5-mini', price: '$0.25 / $2.00' },
  { model: 'my-finetune-v3', price: 'not in catalog · send cost' },
];

export function AiSettingsContent() {
  return (
    <>
      <MockTabs
        active={1}
        items={['Details', 'AI', 'Clients', 'MCP', 'Tracking']}
      />
      <div className="grid @2xl:grid-cols-2 grid-cols-1 items-start gap-3">
        <Panel>
          <div className="col gap-1">
            <span className="font-semibold text-[13px]">Content storage</span>
            <span className="text-[11.5px] text-neutral-500 leading-snug">
              Keep the prompts and completions of each call for 30 days. Model,
              tokens, cost, latency and errors are kept either way.
            </span>
          </div>
          <Toggle label="Store prompts and completions" on={false} />
          <span className="rounded-md bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-500">
            Off: tokens, cost and latency only. Send{' '}
            <span className="font-mono">privacyMode</span> per call to skip
            content for one feature while storage is on.
          </span>
        </Panel>
        <Panel>
          <div className="col gap-1">
            <span className="font-semibold text-[13px]">Pricing</span>
            <span className="text-[11.5px] text-neutral-500 leading-snug">
              Cost is computed from the built-in catalog, per 1M input / output
              tokens, or from the <span className="font-mono">cost</span> you
              send.
            </span>
          </div>
          <div className="col divide-y divide-neutral-100 rounded-md border border-neutral-200 text-[11.5px]">
            {PRICE_CATALOG.map((row) => (
              <div
                className="row items-center justify-between px-2.5 py-1.5"
                key={row.model}
              >
                <span className="font-mono">{row.model}</span>
                <span
                  className={cn(
                    'font-mono',
                    row.price.startsWith('not')
                      ? 'text-amber-700'
                      : 'text-neutral-600'
                  )}
                >
                  {row.price}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

export const AI_MOCKS = {
  ai: {
    content: () => <AiOverviewContent />,
    shell: { page: 'ai', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  'ai-cost': {
    content: () => <AiCostContent />,
    shell: { page: 'ai', project: 'Acme SaaS' },
    insetWidth: 860,
  },
  'ai-trace': {
    content: () => <AiTraceContent />,
    shell: { page: 'ai', project: 'Acme SaaS' },
    insetWidth: 860,
  },
  'ai-settings': {
    content: () => <AiSettingsContent />,
    shell: { page: 'settings', project: 'Acme SaaS' },
    insetWidth: 860,
  },
  chat: {
    content: () => <ChatMock />,
  },
  'chat-inapp': {
    content: () => <ChatInappContent />,
    shell: { page: 'chat', project: 'Acme SaaS' },
    insetWidth: 760,
  },
} satisfies Record<string, MockDefinition>;
