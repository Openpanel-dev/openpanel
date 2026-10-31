import { BellIcon, MousePointer2Icon, PauseIcon, PlayIcon } from 'lucide-react';
import { AreaChart, Avatar, BarSpark } from './primitives';
import type { MockDefinition } from './types';

// Small, self-contained pieces of the dashboard for the feature grid.

export function MiniFunnel() {
  const steps = [100, 62, 38, 21];
  return (
    <div className="row h-full items-end gap-2">
      {steps.map((share, index) => (
        <div className="col flex-1 gap-1.5" key={share}>
          <span className="font-mono text-[11px] text-neutral-600">
            {share}%
          </span>
          <div className="col h-24 justify-end rounded-md bg-neutral-100 p-1">
            <div
              className={
                index === 0 ? 'rounded bg-blue-600' : 'rounded bg-blue-600/80'
              }
              style={{ height: `${share}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiniRetention() {
  const rows = [
    { label: 'Oct 6', values: [100, 52, 41, 36, 33] },
    { label: 'Oct 13', values: [100, 55, 44, 38] },
    { label: 'Oct 20', values: [100, 57, 46] },
    { label: 'Oct 27', values: [100, 59] },
  ];
  const weeks = ['w0', 'w1', 'w2', 'w3', 'w4'];
  return (
    <div className="grid grid-cols-5 gap-1">
      {rows.flatMap((row) =>
        weeks.map((week, column) => {
          const value = row.values[column];
          return (
            <span
              className="center-center h-7 rounded font-mono text-[10px] text-blue-950"
              key={`${row.label}-${week}`}
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
        })
      )}
    </div>
  );
}

export function MiniReplay() {
  return (
    <div className="col gap-3">
      <div className="relative h-24 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
        <div className="absolute top-3 left-3 h-2 w-20 rounded bg-neutral-200" />
        <div className="absolute top-8 left-3 h-2 w-32 rounded bg-neutral-200" />
        <div className="absolute top-13 left-3 h-6 w-16 rounded bg-neutral-900" />
        <MousePointer2Icon className="absolute top-14 left-12 size-4 fill-white text-neutral-900" />
        <span className="absolute top-13 left-9 size-5 rounded-full border-2 border-blue-500/60" />
      </div>
      <div className="row items-center gap-2 text-[11px] text-neutral-500">
        <PauseIcon className="size-3 fill-current" />
        <span className="font-mono">01:24</span>
        <div className="relative h-1 flex-1 rounded-full bg-neutral-200">
          <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-blue-600" />
        </div>
        <span className="font-mono">04:10</span>
      </div>
    </div>
  );
}

export function MiniNotification() {
  return (
    <div className="col gap-2">
      <div className="row items-start gap-2.5 rounded-lg border border-neutral-200 bg-white p-3 text-[12px] shadow-sm">
        <span className="center-center size-7 shrink-0 rounded-md bg-neutral-900 text-white">
          <BellIcon className="size-3.5" />
        </span>
        <span className="col gap-0.5">
          <span className="font-medium">
            Sign-ups dropped 38% in the last hour
          </span>
          <span className="text-neutral-500">
            Acme Web · usual: 42/h, now: 26/h
          </span>
        </span>
      </div>
      <div className="row items-start gap-2.5 rounded-lg border border-neutral-200 bg-white p-3 text-[12px] opacity-70">
        <span className="center-center size-7 shrink-0 rounded-md bg-emerald-600 text-white">
          <PlayIcon className="size-3.5" />
        </span>
        <span className="col gap-0.5">
          <span className="font-medium">
            New customer: fullscript.io upgraded
          </span>
          <span className="text-neutral-500">Slack · #sales</span>
        </span>
      </div>
    </div>
  );
}

export function MiniRevenue() {
  return (
    <div className="col gap-2">
      <div className="row items-baseline gap-2">
        <span className="font-mono font-semibold text-xl">$18,420</span>
        <span className="font-medium text-[11px] text-emerald-600">
          ↑ 14.2%
        </span>
      </div>
      <AreaChart height={70} primary={[8, 9, 11, 10, 13, 15, 14, 18]} />
    </div>
  );
}

export function MiniRealtime() {
  return (
    <div className="col gap-3">
      <div className="row items-center gap-2">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-mono font-semibold text-xl">142</span>
        <span className="text-[11px] text-neutral-500">on your site now</span>
      </div>
      <BarSpark values={[3, 5, 4, 6, 8, 7, 9, 8, 10, 12, 11, 14]} />
      <div className="row items-center gap-2 text-[11px] text-neutral-500">
        <Avatar initials="SE" /> Stockholm · /pricing
        <span className="ml-auto font-mono">2s ago</span>
      </div>
    </div>
  );
}

export const MINI_MOCKS = {
  'mini-funnel': { content: () => <MiniFunnel /> },
  'mini-retention': { content: () => <MiniRetention /> },
  'mini-replay': { content: () => <MiniReplay /> },
  'mini-notifications': { content: () => <MiniNotification /> },
  'mini-revenue': { content: () => <MiniRevenue /> },
  'mini-realtime': { content: () => <MiniRealtime /> },
} satisfies Record<string, MockDefinition>;
