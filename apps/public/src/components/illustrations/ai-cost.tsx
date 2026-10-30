import { AlertTriangleIcon } from 'lucide-react';
import { IllustrationCard, IllustrationPanel, Stat } from './shared';
import { cn } from '@/lib/utils';

const CALLS = [
  {
    user: 'A',
    feature: 'Summarize ticket',
    model: 'claude-sonnet-5-5',
    cost: '$0.004',
    latency: '1.2s',
  },
  {
    user: 'M',
    feature: 'Draft reply',
    model: 'gpt-5',
    cost: '$0.011',
    latency: '2.8s',
  },
  {
    user: 'J',
    feature: 'Classify intent',
    model: 'gpt-5-mini',
    cost: '$0.001',
    latency: '0.4s',
  },
  {
    user: 'S',
    feature: 'Draft reply',
    model: 'gpt-5',
    cost: '$0.000',
    latency: 'Timed out',
    failed: true,
  },
];

export function AiCostIllustration() {
  return (
    <IllustrationPanel>
      <IllustrationCard className="max-w-md">
        <div className="row items-end justify-between">
          <Stat change="-18%" label="AI cost today" value="$12.40" />
          <Stat label="Calls" value="3,104" />
        </div>
        <ul className="col divide-y">
          {CALLS.map((call) => (
            <li
              className="row items-center gap-3 py-3 text-sm"
              key={`${call.user}-${call.feature}`}
            >
              <span className="center-center size-8 shrink-0 rounded-full bg-muted font-medium">
                {call.user}
              </span>
              <span className="col min-w-0 flex-1">
                <span className="truncate font-medium">{call.feature}</span>
                <span className="truncate text-muted-foreground">
                  {call.model}
                </span>
              </span>
              <span
                className={cn(
                  'row items-center gap-1 text-muted-foreground',
                  call.failed && 'text-red-600'
                )}
              >
                {call.failed && <AlertTriangleIcon className="size-3.5" />}
                {call.latency}
              </span>
              <span className="w-14 text-right font-medium tabular-nums">
                {call.cost}
              </span>
            </li>
          ))}
        </ul>
      </IllustrationCard>
    </IllustrationPanel>
  );
}
