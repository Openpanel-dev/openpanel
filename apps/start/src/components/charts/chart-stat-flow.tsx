'use client';

import NumberFlow from '@number-flow/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/** Subset of `Intl.NumberFormatOptions` supported by NumberFlow */
export interface ChartStatFlowFormat {
  notation?: 'standard' | 'compact';
  compactDisplay?: 'short' | 'long';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumIntegerDigits?: number;
  minimumSignificantDigits?: number;
  maximumSignificantDigits?: number;
  style?: 'decimal' | 'percent' | 'currency';
  currency?: string;
  currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  unit?: string;
  unitDisplay?: 'short' | 'long' | 'narrow';
}

export const defaultChartStatFlowFormat: ChartStatFlowFormat = {
  notation: 'standard',
  maximumFractionDigits: 0,
};

function formatStatValue(
  value: number,
  formatOptions: ChartStatFlowFormat,
  prefix?: string,
  suffix?: string
): string {
  const formatted = new Intl.NumberFormat(undefined, formatOptions).format(
    value
  );
  return `${prefix ?? ''}${formatted}${suffix ?? ''}`;
}

function useNumberFlowElementReady(): boolean {
  const [ready, setReady] = useState(
    () =>
      typeof customElements !== 'undefined' &&
      Boolean(customElements.get('number-flow-react'))
  );

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    customElements.whenDefined('number-flow-react').then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

export interface ChartStatFlowProps {
  value: number;
  label: string;
  formatOptions?: ChartStatFlowFormat;
  prefix?: string;
  suffix?: string;
  valueClassName?: string;
  labelClassName?: string;
  icon?: ReactNode;
}

/**
 * Shared value + label stack using NumberFlow (same layout as pie / ring centers).
 * Parent should provide flex alignment and sizing when needed.
 */
export function ChartStatFlow({
  value,
  label,
  formatOptions = defaultChartStatFlowFormat,
  prefix,
  suffix,
  valueClassName = 'text-2xl font-bold',
  labelClassName = 'text-xs',
  icon,
}: ChartStatFlowProps) {
  const numberFlowReady = useNumberFlowElementReady();
  const staticValue = useMemo(
    () => formatStatValue(value, formatOptions, prefix, suffix),
    [value, formatOptions, prefix, suffix]
  );

  return (
    <>
      {icon ? (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
          {icon}
        </div>
      ) : null}
      <span className={cn('text-foreground tabular-nums', valueClassName)}>
        {numberFlowReady ? (
          <NumberFlow
            format={formatOptions}
            isolate
            prefix={prefix}
            suffix={suffix}
            value={value}
            willChange
          />
        ) : (
          staticValue
        )}
      </span>
      <span className={cn('mt-0.5 text-chart-label', labelClassName)}>
        {label}
      </span>
    </>
  );
}

ChartStatFlow.displayName = 'ChartStatFlow';
