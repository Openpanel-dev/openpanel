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

  // Explicit `minmax(0, 1fr)` tracks are important here — the default
  // `grid-cols-N` in Tailwind resolves to `minmax(auto, 1fr)`, which
  // lets a long value (e.g. a long `biography` property) push its
  // column wider than its share and bleed over into the neighbouring
  // cell regardless of overflow-hidden on the child.
  const gridCols = {
    1: 'grid-cols-[minmax(0,1fr)]',
    2: 'grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
    3: 'grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]',
    4: 'grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]',
  };

  return (
    <div
      className={cn('grid card overflow-hidden', gridCols[columns], className)}
    >
      {data.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className={cn(
            // `min-w-0 overflow-hidden` on the grid cell itself stops
            // long values from pushing the column wider than its 1fr
            // share — without this a property like `biography` bleeds
            // over the neighbouring cell's label.
            'relative flex min-w-0 items-center justify-between gap-4 overflow-hidden p-4 py-3 shadow-[0_0_0_0.5px] shadow-border group',
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
                if (typeof item.value === 'object') {
                  try {
                    const value = JSON.stringify(item.value);
                    clipboard(value);
                  }
                  catch {
                    clipboard(item.value);
                  }
                }
                else {
                  clipboard(item.value);
                }
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
          <div
            className={cn(
              // `min-w-0` is required so the truncate can actually
              // shrink inside the parent flex row — without it long
              // values overflow into the neighbouring cell.
              'min-w-0 flex-shrink text-right text-sm font-mono truncate',
              valueClassName,
            )}
            title={typeof item.value === 'string' ? item.value : undefined}
          >
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
