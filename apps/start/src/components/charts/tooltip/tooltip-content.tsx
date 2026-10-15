'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { intFmt } from '../chart-formatters';

export interface TooltipRow {
  color: string;
  label: string;
  value: string | number;
}

export interface TooltipContentProps {
  title?: string;
  rows: TooltipRow[];
  /** Optional additional content (e.g., markers) */
  children?: ReactNode;
}

export interface TooltipHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Popover-style header row: medium-weight label separated from the body by a
 * full-width border. Use it at the top of custom `ChartTooltip` `content`.
 */
export function TooltipHeader({ children, className }: TooltipHeaderProps) {
  return (
    <div
      className={cn(
        'border-b px-3.5 py-2.5 text-left font-medium text-chart-tooltip-foreground text-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

TooltipHeader.displayName = 'TooltipHeader';

export function TooltipContent({ title, rows, children }: TooltipContentProps) {
  const hasBody = rows.length > 0 || Boolean(children);
  return (
    <div>
      {title && <TooltipHeader>{title}</TooltipHeader>}
      {hasBody && (
        <div className="px-3.5 py-3">
          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  className="flex items-center justify-between gap-6"
                  key={`${row.label}-${row.color}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="truncate text-chart-tooltip-muted text-sm">
                      {row.label}
                    </span>
                  </div>
                  <span className="text-right font-medium text-chart-tooltip-foreground text-sm tabular-nums">
                    {typeof row.value === 'number'
                      ? intFmt(row.value)
                      : row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {children && (
            <div
              className={cn(
                'transition-opacity duration-200 ease-out',
                rows.length > 0 && 'mt-2'
              )}
            >
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

TooltipContent.displayName = 'TooltipContent';

export default TooltipContent;
