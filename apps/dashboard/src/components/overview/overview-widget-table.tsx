import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { ExternalLinkIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';
import { WidgetTable, type Props as WidgetTableProps } from '../widget-table';

type Props<T> = WidgetTableProps<T> & {
  getColumnPercentage: (item: T) => number;
};

export const OverviewWidgetTable = <T,>({
  data,
  keyExtractor,
  columns,
  getColumnPercentage,
  className,
}: Props<T>) => {
  return (
    <div className={cn(className)}>
      <WidgetTable
        data={data ?? []}
        keyExtractor={keyExtractor}
        className={'text-sm min-h-[358px]'}
        columnClassName="px-2 group/row items-center"
        eachColumn={(item) => {
          return (
            <div className="absolute inset-1 inset-x-3 !p-0">
              <div
                className="h-full bg-def-200 rounded-sm group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900 transition-colors"
                style={{
                  width: `${getColumnPercentage(item) * 100}%`,
                }}
              />
            </div>
          );
        }}
        columns={columns.map((column, index) => {
          return {
            ...column,
            className: cn(
              index === 0
                ? 'w-full flex-1 font-medium min-w-0'
                : 'text-right w-20 font-mono',
              column.className,
            ),
          };
        })}
      />
    </div>
  );
};

function getPath(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path;
  }
}

export function OverviewWidgetTablePages({
  data,
  lastColumnName,
  className,
}: {
  className?: string;
  lastColumnName: string;
  data: {
    total_sessions: number;
    origin: string;
    path: string;
    avg_duration: number;
    bounce_rate: number;
    sessions: number;
  }[];
}) {
  const [filters, setFilter] = useEventQueryFilters();
  const number = useNumber();
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.path + item.origin}
      getColumnPercentage={(item) => item.sessions / item.total_sessions}
      columns={[
        {
          name: 'Path',
          render(item) {
            return (
              <Tooltiper asChild content={item.origin + item.path} side="left">
                <div className="row items-center gap-2 min-w-0 relative">
                  <SerieIcon name={item.origin} />
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => {
                      setFilter('path', item.path);
                      setFilter('origin', item.origin);
                    }}
                  >
                    {getPath(item.path)}
                  </button>
                  <a
                    href={item.origin + item.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="size-3 group-hover/row:opacity-100 opacity-0 transition-opacity" />
                  </a>
                </div>
              </Tooltiper>
            );
          },
        },
        {
          name: 'BR',
          className: 'w-16',
          render(item) {
            return number.shortWithUnit(item.bounce_rate, '%');
          },
        },
        {
          name: 'Duration',
          render(item) {
            return number.shortWithUnit(item.avg_duration, 'min');
          },
        },
        {
          name: lastColumnName,
          // className: 'w-28',
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.sessions)}
                </span>
              </div>
            );
          },
        },
      ]}
    />
  );
}

export function OverviewWidgetTableBots({
  data,
  className,
}: {
  className?: string;
  data: {
    total_sessions: number;
    origin: string;
    path: string;
    sessions: number;
    avg_duration: number;
    bounce_rate: number;
  }[];
}) {
  const [filters, setFilter] = useEventQueryFilters();
  const number = useNumber();
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.path + item.origin}
      getColumnPercentage={(item) => item.sessions / item.total_sessions}
      columns={[
        {
          name: 'Path',
          render(item) {
            return (
              <Tooltiper asChild content={item.origin + item.path} side="left">
                <div className="row items-center gap-2 min-w-0 relative">
                  <SerieIcon name={item.origin} />
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => {
                      setFilter('path', item.path);
                    }}
                  >
                    {getPath(item.path)}
                  </button>
                  <a
                    href={item.origin + item.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="size-3 group-hover/row:opacity-100 opacity-0 transition-opacity" />
                  </a>
                </div>
              </Tooltiper>
            );
          },
        },
        {
          name: 'Bot',
          // className: 'w-28',
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">Google bot</span>
              </div>
            );
          },
        },
        {
          name: 'Date',
          // className: 'w-28',
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">Google bot</span>
              </div>
            );
          },
        },
      ]}
    />
  );
}

export function OverviewWidgetTableGeneric({
  data,
  column,
  className,
}: {
  className?: string;
  data: RouterOutputs['overview']['topGeneric'];
  column: {
    name: string;
    render: (
      item: RouterOutputs['overview']['topGeneric'][number],
    ) => React.ReactNode;
  };
}) {
  const number = useNumber();
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.name}
      getColumnPercentage={(item) => item.sessions / item.total_sessions}
      columns={[
        column,
        {
          name: 'BR',
          className: 'w-16',
          render(item) {
            return number.shortWithUnit(item.bounce_rate, '%');
          },
        },
        {
          name: 'Duration',
          render(item) {
            return number.shortWithUnit(item.avg_session_duration, 'min');
          },
        },
        {
          name: 'Sessions',
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.sessions)}
                </span>
              </div>
            );
          },
        },
      ]}
    />
  );
}
