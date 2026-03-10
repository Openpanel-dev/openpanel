'use client';

import { SimpleChart } from '@/components/simple-chart';

const revenuePoints = [28, 34, 31, 40, 37, 44, 41, 50, 47, 56, 59, 65];

const referrers = [
  { name: 'google.com', amount: '$3,840', pct: 46 },
  { name: 'twitter.com', amount: '$1,920', pct: 23 },
  { name: 'github.com', amount: '$1,260', pct: 15 },
  { name: 'direct', amount: '$1,400', pct: 16 },
];

export function RevenueIllustration() {
  return (
    <div className="h-full col gap-3 px-4 pb-3 pt-5">
      {/* MRR stat + chart */}
      <div className="row gap-3">
        <div className="col gap-1 rounded-xl border bg-card p-3 transition-all duration-300 group-hover:-translate-y-0.5">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            MRR
          </span>
          <span className="font-bold font-mono text-xl text-emerald-500">
            $8,420
          </span>
          <span className="text-[9px] text-emerald-500">↑ 12% this month</span>
        </div>
        <div className="col flex-1 gap-1 rounded-xl border bg-card px-3 py-2">
          <span className="text-[9px] text-muted-foreground">MRR over time</span>
          <SimpleChart
            className="mt-1 flex-1"
            height={36}
            points={revenuePoints}
            strokeColor="rgb(34, 197, 94)"
            width={400}
          />
        </div>
      </div>

      {/* Revenue by referrer */}
      <div className="flex-1 overflow-hidden rounded-xl border bg-card">
        <div className="row border-b border-border px-3 py-1.5">
          <span className="flex-1 text-[8px] uppercase tracking-wider text-muted-foreground">
            Referrer
          </span>
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground">
            Revenue
          </span>
        </div>
        {referrers.map((r) => (
          <div
            className="row items-center gap-2 border-b border-border/50 px-3 py-1.5 last:border-0"
            key={r.name}
          >
            <span className="text-[9px] text-muted-foreground flex-none w-20 truncate">
              {r.name}
            </span>
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-1 rounded-full bg-emerald-500/70"
                style={{ width: `${r.pct}%` }}
              />
            </div>
            <span className="font-mono text-[9px] text-emerald-500 flex-none">
              {r.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
