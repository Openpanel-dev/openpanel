import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { prop, uniqBy } from 'ramda';
import { OverviewWidgetTable } from '../overview/overview-widget-table';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';

interface RealtimePathsProps {
  projectId: string;
}

export function RealtimePaths({ projectId }: RealtimePathsProps) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.realtime.paths.queryOptions({
      projectId,
    })
  );

  const data = query.data ?? [];
  const maxCount = Math.max(...data.map((item) => item.count));
  const number = useNumber();

  // Get unique origins for header icons
  const unique = uniqBy(prop('origin'), data)
    .filter((i) => !!i.origin.trim())
    .slice(0, 5);

  return (
    <div className="col card h-full">
      <div className="row items-center justify-between p-4 pb-0">
        <div className="font-medium text-muted-foreground">Paths</div>
        <div className="row gap-1">
          {unique.map((item) => (
            <Tooltiper content={item.origin} key={item.origin}>
              <SerieIcon key={item.origin} name={item.origin} />
            </Tooltiper>
          ))}
        </div>
      </div>
      <OverviewWidgetTable
        columns={[
          {
            name: 'Path',
            width: 'w-full',
            responsive: { priority: 1 },
            render(item) {
              return (
                <Tooltiper
                  asChild
                  content={item.origin + item.path}
                  disabled={item.origin === ''}
                  side="left"
                >
                  <div className="row relative min-w-0 items-center gap-2">
                    <SerieIcon name={item.origin} />
                    <span className="truncate">{item.path || '(Not set)'}</span>
                    {item.origin && (
                      <a
                        href={item.origin + item.path}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLinkIcon className="size-3 opacity-0 transition-opacity group-hover/row:opacity-100" />
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
            responsive: { priority: 7 },
            render(item) {
              return number.shortWithUnit(item.avg_duration, 'min');
            },
          },
          {
            name: 'Events',
            width: '60px',
            responsive: { priority: 4 },
            render(item) {
              return (
                <div className="row justify-end gap-2">
                  <span className="font-semibold">
                    {number.short(item.count)}
                  </span>
                </div>
              );
            },
          },
          {
            name: 'Sessions',
            width: '82px',
            responsive: { priority: 2 },
            render(item) {
              return (
                <div className="row justify-end gap-2">
                  <span className="font-semibold">
                    {number.short(item.unique_sessions)}
                  </span>
                </div>
              );
            },
          },
        ]}
        data={data ?? []}
        getColumnPercentage={(item) => item.count / maxCount}
        keyExtractor={(item) => item.path + item.origin}
      />
    </div>
  );
}
