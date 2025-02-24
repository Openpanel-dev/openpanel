import { api } from '@/trpc/client';
import { useState } from 'react';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useNumber } from '@/hooks/useNumerFormatter';
import { ExternalLinkIcon } from 'lucide-react';
import { Pagination } from '../pagination';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';
import { WidgetTable } from '../widget-table';
import { OverviewWidgetTable } from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';

interface Props {
  projectId: string;
}

function getPath(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path;
  }
}

const OverviewTopBots = ({ projectId }: Props) => {
  const number = useNumber();
  const { range, interval, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const res = api.overview.topPages.useQuery(
    {
      projectId,
      interval,
      range,
      startDate,
      endDate,
      filters: filters,
    },
    { keepPreviousData: true },
  );
  const data = res.data;

  return (
    <>
      <OverviewWidgetTable
        data={data ?? []}
        keyExtractor={(item) => item.path + item.origin}
        getColumnPercentage={(item) =>
          item.screen_views / item.total_screen_views
        }
        columns={[
          {
            name: 'Path',
            render(item) {
              return (
                <Tooltiper
                  asChild
                  content={item.origin + item.path}
                  side="left"
                >
                  <div className="row items-center gap-2 min-w-0 relative">
                    <SerieIcon name={'https://strackr.com/'} />
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
            name: 'BR',
            className: 'w-14',
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
            name: 'Sessions',
            // className: 'w-28',
            render(item) {
              return (
                <div className="row gap-2 justify-end">
                  <span className="font-semibold">
                    {number.short(item.screen_views)}
                  </span>
                </div>
              );
            },
          },
        ]}
      />
    </>
  );
};

export default OverviewTopBots;
