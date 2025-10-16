import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { countries } from '@/translations/countries';
import { camelCaseToWords } from '@/utils/casing';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { formatDateTime, formatTime } from '@/utils/date';
import type { IServiceEvent } from '@openpanel/db';
import { isToday } from 'date-fns';
import { CopyIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';

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
            key={name}
            className={
              index === splitKey.length - 1
                ? 'text-foreground'
                : 'text-muted-foreground'
            }
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
      <FieldValue name={item.name} value={item.value} event={item.event} />
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
      className={cn('grid card overflow-hidden', gridCols[columns], className)}
    >
      {data.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className={cn(
            'relative flex items-center justify-between gap-4 p-4 py-3 shadow-[0_0_0_0.5px] shadow-border group',
            onItemClick && 'cursor-pointer hover:bg-muted/50',
            rowClassName,
          )}
          onClick={() => onItemClick?.(item)}
          onKeyDown={(e) => {
            if (onItemClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onItemClick(item);
            }
          }}
          tabIndex={onItemClick ? 0 : undefined}
          role={onItemClick ? 'button' : undefined}
        >
          {copyable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clipboard(item.value);
              }}
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 -translate-x-full opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200 ease-out bg-background border border-border rounded p-1 shadow-sm z-10"
            >
              <CopyIcon className="size-3 shrink-0" />
            </button>
          )}
          <div className={cn('flex-1 min-w-0 text-sm', keyClassName)}>
            {renderKey ? renderKey(item) : defaultRenderKey(item)}
          </div>
          <div className={cn('text-right text-sm font-mono', valueClassName)}>
            {renderValue ? renderValue(item) : defaultRenderValue(item)}
          </div>
        </div>
      ))}

      {data.length === 0 && (
        <div className="text-center text-muted-foreground py-8 col-span-full">
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
          <div className="row gap-2 items-center">
            <SerieIcon name={event.os} />
            <span>{value}</span>
          </div>
        );
      case 'browserVersion':
        return (
          <div className="row gap-2 items-center">
            <SerieIcon name={event.browser} />
            <span>{value}</span>
          </div>
        );
      case 'city':
        return (
          <div className="row gap-2 items-center">
            <SerieIcon name={event.country} />
            <span>{value}</span>
          </div>
        );
      case 'region':
        return (
          <div className="row gap-2 items-center">
            <SerieIcon name={event.country} />
            <span>{value}</span>
          </div>
        );
      case 'properties':
        return JSON.stringify(value);
      case 'country':
        return (
          <div className="row gap-2 items-center">
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
          <div className="row gap-2 items-center">
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
