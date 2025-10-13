'use client';

import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { prop, uniqBy } from 'ramda';
import { OverviewWidgetTable } from '../overview/overview-widget-table';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';

interface RealtimePathsProps {
  projectId: string;
}

export function RealtimePaths({ projectId }: RealtimePathsProps) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.realtime.paths.queryOptions({
      projectId,
    }),
  );

  const data = query.data ?? [];
  const maxCount = Math.max(...data.map((item) => item.count));
  const number = useNumber();

  // Get unique origins for header icons
  const unique = uniqBy(prop('origin'), data)
    .filter((i) => !!i.origin.trim())
    .slice(0, 5);

  return (
    <div className="col h-full card">
      <div className="row justify-between items-center p-4 pb-0">
        <div className="font-medium text-muted-foreground">Paths</div>
        <div className="row gap-1">
          {unique.map((item) => (
            <Tooltiper key={item.origin} content={item.origin}>
              <SerieIcon key={item.origin} name={item.origin} />
            </Tooltiper>
          ))}
        </div>
      </div>
      <OverviewWidgetTable
        data={data ?? []}
        keyExtractor={(item) => item.path + item.origin}
        getColumnPercentage={(item) => item.count / maxCount}
        columns={[
          {
            name: 'Path',
            width: 'w-full',
            render(item) {
              return (
                <Tooltiper
                  asChild
                  content={item.origin + item.path}
                  side="left"
                  disabled={item.origin === ''}
                >
                  <div className="row items-center gap-2 min-w-0 relative">
                    <SerieIcon name={item.origin} />
                    <span className="truncate">{item.path || '(Not set)'}</span>
                    {item.origin && (
                      <a
                        href={item.origin + item.path}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLinkIcon className="size-3 group-hover/row:opacity-100 opacity-0 transition-opacity" />
                      </a>
                    )}
                  </div>
                </Tooltiper>
              );
            },
          },
          {
            name: 'Duration',
            width: '75px',
            render(item) {
              return number.shortWithUnit(item.avg_duration, 'min');
            },
          },
          {
            name: 'Events',
            width: '84px',
            render(item) {
              return (
                <div className="row gap-2 justify-end">
                  <span className="font-semibold">
                    {number.short(item.count)}
                  </span>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
