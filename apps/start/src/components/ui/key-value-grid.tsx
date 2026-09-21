import type { IServiceEvent } from '@openpanel/core';
import { isToday } from 'date-fns';
import { CopyIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { countries } from '@/translations/countries';
import { camelCaseToWords } from '@/utils/casing';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { formatDateTime, formatTime } from '@/utils/date';

export interface KeyValueItem {
  name: string;
  value: any;
  event?: IServiceEvent;
}

interface KeyValueGridProps {
  data: KeyValueItem[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  rowClassName?: string;
  keyClassName?: string;
  valueClassName?: string;
  renderKey?: (item: KeyValueItem) => React.ReactNode;
  renderValue?: (item: KeyValueItem) => React.ReactNode;
  onItemClick?: (item: KeyValueItem) => void;
  copyable?: boolean;
}

/**
 * The value cell truncates, so the full value is only reachable through the native
 * tooltip and the copy button. Both need a string, and objects render as JSON here,
 * so stringify them rather than leaving the value unreadable.
 */
export function toStringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  return String(value);
}

export function KeyValueGrid({
  data,
  columns = 1,
  className,
  rowClassName,
  keyClassName,
  valueClassName,
  renderKey,
  renderValue,
  onItemClick,
  copyable = false,
}: KeyValueGridProps) {
  const defaultRenderKey = (item: KeyValueItem) => {
    const splitKey = item.name.split('.');
    return (
      <div className="flex items-center gap-1">
        {splitKey.map((name, index) => (
          <span
            className={
              index === splitKey.length - 1
                ? 'text-foreground'
                : 'text-muted-foreground'
            }
            key={name}
          >
            {camelCaseToWords(name)}
            {index < splitKey.length - 1 && (
              <span className="text-muted-foreground">.</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  const defaultRenderValue = (item: KeyValueItem) => {
    return (
      <FieldValue event={item.event} name={item.name} value={item.value} />
    );
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div
      className={cn('card grid overflow-hidden', gridCols[columns], className)}
    >
      {data.map((item, index) => {
        const stringValue = toStringValue(item.value);

        return (
          <div
            className={cn(
              'group relative flex items-center justify-between gap-4 p-4 py-3 shadow-[0_0_0_0.5px] shadow-border',
              onItemClick && 'cursor-pointer hover:bg-muted/50',
              rowClassName
            )}
            key={`${item.name}-${index}`}
            onClick={() => onItemClick?.(item)}
            onKeyDown={(e) => {
              if (onItemClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onItemClick(item);
              }
            }}
            role={onItemClick ? 'button' : undefined}
            tabIndex={onItemClick ? 0 : undefined}
          >
            {copyable && stringValue !== undefined && (
              <button
                className="absolute top-1/2 left-2 z-10 -translate-x-full -translate-y-1/2 rounded border border-border bg-background p-1 opacity-0 shadow-sm transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  clipboard(stringValue);
                }}
                type="button"
              >
                <CopyIcon className="size-3 shrink-0" />
              </button>
            )}
            <div className={cn('min-w-0 flex-1 text-sm', keyClassName)}>
              {renderKey ? renderKey(item) : defaultRenderKey(item)}
            </div>
            <div
              className={cn(
                'min-w-0 max-w-[60%] truncate text-right font-mono text-sm',
                valueClassName
              )}
              title={stringValue}
            >
              {renderValue ? renderValue(item) : defaultRenderValue(item)}
            </div>
          </div>
        );
      })}

      {data.length === 0 && (
        <div className="col-span-full py-8 text-center text-muted-foreground">
          No data available
        </div>
      )}
    </div>
  );
}

export function FieldValue({
  name,
  value,
  event,
}: {
  name: string;
  value: any;
  event?: IServiceEvent;
}) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isToday(value) ? formatTime(value) : formatDateTime(value);
  }

  if (event) {
    switch (name) {
      case 'osVersion':
        return (
          <div className="row items-center gap-2">
            <SerieIcon name={event.os} />
            <span>{value}</span>
          </div>
        );
      case 'browserVersion':
        return (
          <div className="row items-center gap-2">
            <SerieIcon name={event.browser} />
            <span>{value}</span>
          </div>
        );
      case 'city':
        return (
          <div className="row items-center gap-2">
            <SerieIcon name={event.country} />
            <span>{value}</span>
          </div>
        );
      case 'region':
        return (
          <div className="row items-center gap-2">
            <SerieIcon name={event.country} />
            <span>{value}</span>
          </div>
        );
      case 'properties':
        return JSON.stringify(value);
      case 'country':
        return (
          <div className="row items-center gap-2">
            <SerieIcon name={value} />
            <span>{countries[value as keyof typeof countries] ?? value}</span>
          </div>
        );
      case 'browser':
      case 'os':
      case 'brand':
      case 'model':
      case 'device':
        return (
          <div className="row items-center gap-2">
            <SerieIcon name={value} />
            <span>{value}</span>
          </div>
        );
      case 'duration':
        return (
          <div className="text-right">
            <span className="text-muted-foreground">({value}ms)</span>{' '}
            {fancyMinutes(value / 1000)}
          </div>
        );
    }
  }

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'true' : 'false'}</span>;
  }

  if (typeof value === 'object') {
    return <span>{JSON.stringify(value)}</span>;
  }

  return <span>{String(value)}</span>;
}
