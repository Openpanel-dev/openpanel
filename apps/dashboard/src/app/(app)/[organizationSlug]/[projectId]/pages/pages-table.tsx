'use client';

import { memo } from 'react';
import { ReportChart } from '@/components/report-chart';
import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import isEqual from 'lodash.isequal';
import { ExternalLinkIcon } from 'lucide-react';

import type { IServicePage } from '@openpanel/db';

export const PagesTable = memo(
  ({ data }: { data: IServicePage[] }) => {
    const number = useNumber();
    const cell =
      'flex min-h-12 whitespace-nowrap px-4 align-middle shadow-[0_0_0_0.5px] shadow-border';
    return (
      <div className="overflow-x-auto rounded-md border bg-background">
        <div className={cn('min-w-[800px]')}>
          <div className="grid grid-cols-[0.2fr_auto_1fr] overflow-hidden rounded-t-none border-b">
            <div className="center-center h-10 rounded-tl-md bg-def-100 p-4 font-semibold text-muted-foreground">
              Views
            </div>
            <div className="flex h-10 w-80 items-center bg-def-100 p-4 font-semibold text-muted-foreground">
              Path
            </div>
            <div className="flex h-10 items-center rounded-tr-md bg-def-100 p-4 font-semibold text-muted-foreground">
              Chart
            </div>
          </div>
          {data.map((item, index) => {
            return (
              <div
                key={item.path + item.origin + item.title}
                className="grid grid-cols-[0.2fr_auto_1fr] border-b transition-colors last:border-b-0 hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                <div
                  className={cn(
                    cell,
                    'center-center font-mono text-lg font-semibold',
                    index === data.length - 1 && 'rounded-bl-md'
                  )}
                >
                  {number.short(item.count)}
                </div>
                <div
                  className={cn(
                    cell,
                    'flex w-80 flex-col justify-center gap-2 text-left'
                  )}
                >
                  <span className="truncate font-medium">{item.title}</span>
                  {item.origin ? (
                    <a
                      href={item.origin + item.path}
                      className="truncate font-mono text-sm text-muted-foreground underline"
                    >
                      <ExternalLinkIcon className="mr-2 inline-block size-3" />
                      {item.path}
                    </a>
                  ) : (
                    <span className="truncate font-mono text-sm text-muted-foreground">
                      {item.path}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    cell,
                    'p-1',
                    index === data.length - 1 && 'rounded-br-md'
                  )}
                >
                  <ReportChart
                    options={{
                      hideID: true,
                      hideXAxis: true,
                      hideYAxis: true,
                      aspectRatio: 0.15,
                    }}
                    report={{
                      lineType: 'linear',
                      breakdowns: [],
                      name: 'screen_view',
                      metric: 'sum',
                      range: '30d',
                      interval: 'day',
                      previous: true,

                      chartType: 'linear',
                      projectId: item.project_id,
                      events: [
                        {
                          id: 'A',
                          name: 'screen_view',
                          segment: 'event',
                          filters: [
                            {
                              id: 'path',
                              name: 'path',
                              value: [item.path],
                              operator: 'is',
                            },
                            {
                              id: 'origin',
                              name: 'origin',
                              value: [item.origin],
                              operator: 'is',
                            },
                          ],
                        },
                      ],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return isEqual(prevProps.data, nextProps.data);
  }
);

PagesTable.displayName = 'PagesTable';
