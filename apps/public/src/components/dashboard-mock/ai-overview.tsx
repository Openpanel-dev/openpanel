import { AlertTriangleIcon, CheckIcon } from 'lucide-react';
import { AreaChart, Avatar, MockTabs, StatCard } from './primitives';
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
