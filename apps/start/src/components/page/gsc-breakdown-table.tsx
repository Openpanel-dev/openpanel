import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { OverviewWidgetTable } from '@/components/overview/overview-widget-table';
import { Skeleton } from '@/components/skeleton';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

interface GscBreakdownTableProps {
  projectId: string;
  value: string;
  type: 'page' | 'query';
}

export function GscBreakdownTable({ projectId, value, type }: GscBreakdownTableProps) {
  const { range, startDate, endDate } = useOverviewOptions();
  const trpc = useTRPC();

  const dateInput = {
    range,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
  };

  const pageQuery = useQuery(
    trpc.gsc.getPageDetails.queryOptions(
      { projectId, page: value, ...dateInput },
      { enabled: type === 'page' },
    ),
  );

  const queryQuery = useQuery(
    trpc.gsc.getQueryDetails.queryOptions(
      { projectId, query: value, ...dateInput },
      { enabled: type === 'query' },
    ),
  );

  const isLoading = type === 'page' ? pageQuery.isLoading : queryQuery.isLoading;

  const breakdownRows: Record<string, string | number>[] =
    type === 'page'
      ? ((pageQuery.data as { queries?: unknown[] } | undefined)?.queries ?? []) as Record<string, string | number>[]
      : ((queryQuery.data as { pages?: unknown[] } | undefined)?.pages ?? []) as Record<string, string | number>[];

  const breakdownKey = type === 'page' ? 'query' : 'page';
  const breakdownLabel = type === 'page' ? 'Query' : 'Page';

  const maxClicks = Math.max(
    ...(breakdownRows as { clicks: number }[]).map((r) => r.clicks),
    1,
  );

  return (
    <div className="card overflow-hidden">
      <div className="border-b p-4">
        <h3 className="font-medium text-sm">Top {breakdownLabel.toLowerCase()}s</h3>
      </div>
      {isLoading ? (
        <OverviewWidgetTable
          data={[1, 2, 3, 4, 5]}
          keyExtractor={(i) => String(i)}
          getColumnPercentage={() => 0}
          columns={[
            { name: breakdownLabel, width: 'w-full', render: () => <Skeleton className="h-4 w-2/3" /> },
            { name: 'Clicks', width: '70px', render: () => <Skeleton className="h-4 w-10" /> },
            { name: 'Impr.', width: '70px', render: () => <Skeleton className="h-4 w-10" /> },
            { name: 'CTR', width: '60px', render: () => <Skeleton className="h-4 w-8" /> },
            { name: 'Pos.', width: '55px', render: () => <Skeleton className="h-4 w-8" /> },
          ]}
        />
      ) : (
        <OverviewWidgetTable
          data={breakdownRows}
          keyExtractor={(item) => String(item[breakdownKey])}
          getColumnPercentage={(item) => (item.clicks as number) / maxClicks}
          columns={[
            {
              name: breakdownLabel,
              width: 'w-full',
              render(item) {
                return (
                  <div className="min-w-0 overflow-hidden">
                    <span className="block truncate font-mono text-xs">
                      {String(item[breakdownKey])}
                    </span>
                  </div>
                );
              },
            },
            {
              name: 'Clicks',
              width: '70px',
              getSortValue: (item) => item.clicks as number,
              render(item) {
                return (
                  <span className="font-mono font-semibold text-xs">
                    {(item.clicks as number).toLocaleString()}
                  </span>
                );
              },
            },
            {
              name: 'Impr.',
              width: '70px',
              getSortValue: (item) => item.impressions as number,
              render(item) {
                return (
                  <span className="font-mono font-semibold text-xs">
                    {(item.impressions as number).toLocaleString()}
                  </span>
                );
              },
            },
            {
              name: 'CTR',
              width: '60px',
              getSortValue: (item) => item.ctr as number,
              render(item) {
                return (
                  <span className="font-mono font-semibold text-xs">
                    {((item.ctr as number) * 100).toFixed(1)}%
                  </span>
                );
              },
            },
            {
              name: 'Pos.',
              width: '55px',
              getSortValue: (item) => item.position as number,
              render(item) {
                return (
                  <span className="font-mono font-semibold text-xs">
                    {(item.position as number).toFixed(1)}
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}
