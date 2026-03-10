'use client';

import { SimpleChart } from '@/components/simple-chart';

const variantA = [28, 31, 29, 34, 32, 36, 35, 38, 37, 40, 39, 42];
const variantB = [28, 30, 32, 35, 38, 37, 40, 42, 44, 43, 47, 50];

export function ConversionsIllustration() {
  return (
    <div className="h-full col gap-3 px-4 pb-3 pt-5">
      {/* A/B variant cards */}
      <div className="row gap-3">
        <div className="col flex-1 gap-1 rounded-xl border bg-card p-3 transition-all duration-300 group-hover:-translate-y-0.5">
          <div className="row items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
              Variant A
            </span>
          </div>
          <span className="font-bold font-mono text-xl">28.4%</span>
          <SimpleChart
            height={24}
            points={variantA}
            strokeColor="var(--foreground)"
            width={200}
          />
        </div>
        <div className="col flex-1 gap-1 rounded-xl border border-emerald-500/30 bg-card p-3 transition-all delay-75 duration-300 group-hover:-translate-y-0.5">
          <div className="row items-center gap-1.5">
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-600 dark:text-emerald-400">
              Variant B ↑
            </span>
          </div>
          <span className="font-bold font-mono text-xl text-emerald-500">
            41.2%
          </span>
          <SimpleChart
            height={24}
            points={variantB}
            strokeColor="rgb(34, 197, 94)"
            width={200}
          />
        </div>
      </div>

      {/* Breakdown label */}
      <div className="col gap-1 rounded-xl border bg-card/60 px-3 py-2.5">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          Breakdown by experiment variant
        </span>
        <div className="row items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-muted">
            <div
              className="h-1 rounded-full bg-foreground/50"
              style={{ width: '57%' }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">A: 57%</span>
        </div>
        <div className="row items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-muted">
            <div
              className="h-1 rounded-full bg-emerald-500"
              style={{ width: '82%' }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">B: 82%</span>
        </div>
      </div>
    </div>
  );
}
