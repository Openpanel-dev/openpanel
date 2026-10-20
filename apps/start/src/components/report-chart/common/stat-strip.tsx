import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** A row of headline numbers in the overview's metric-card style. */
export function StatStrip({
  children,
  className,
  framed = true,
}: {
  children: ReactNode;
  className?: string;
  /** Draw as its own card. Off when the strip sits inside another card. */
  framed?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 overflow-hidden',
        framed && 'card',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  change,
  detail,
}: {
  label: string;
  value: string;
  change?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="col min-w-0 gap-1 px-4 py-3 shadow-[0_0_0_0.5px] shadow-border">
      <span className="truncate font-medium text-2xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="truncate font-mono font-semibold text-xl tabular-nums tracking-tight">
          {value}
        </span>
        {change}
      </span>
      {detail && (
        <span className="flex min-w-0 items-center gap-1.5 truncate text-2xs text-muted-foreground">
          {detail}
        </span>
      )}
    </div>
  );
}
