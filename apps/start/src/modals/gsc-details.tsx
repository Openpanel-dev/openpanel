import type {
  IChartRange,
  IInterval,
} from '@openpanel/core/modules/report/report.constants';
import { useQuery } from '@tanstack/react-query';
import {
  OPLineChart,
  type OPLineChartSeries,
} from '@/components/charts/op-line-chart';
import { OverviewWidgetTable } from '@/components/overview/overview-widget-table';
import { GSC_CLICKS_SERIES } from '@/components/page/gsc-clicks-chart';
import { Skeleton } from '@/components/skeleton';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTRPC } from '@/integrations/trpc/react';
import { getChartColor } from '@/utils/theme';

const CHART_HEIGHT = 160;

const VIEWS_SERIES: OPLineChartSeries[] = [
  { dataKey: 'views', label: 'Views', color: getChartColor(0) },
];

type Props =
  | {
      type: 'page';
      projectId: string;
      value: string;
      range: IChartRange;
      interval: IInterval;
    }
  | {
      type: 'query';
      projectId: string;
      value: string;
      range: IChartRange;
      interval: IInterval;
    };

export default function GscDetails(props: Props) {
  const { type, projectId, value, range, interval } = props;
  const trpc = useTRPC();

  const dateInput = {
    range,
    interval,
  };

  const pageQuery = useQuery(
    trpc.gsc.getPageDetails.queryOptions(
      { projectId, page: value, ...dateInput },
      { enabled: type === 'page' }
    )
  );

  const queryQuery = useQuery(
    trpc.gsc.getQueryDetails.queryOptions(
      { projectId, query: value, ...dateInput },
      { enabled: type === 'query' }
    )
  );

  const { origin: pageOrigin, path: pagePath } =
    type === 'page'
      ? (() => {
          try {
            const url = new URL(value);
            return { origin: url.origin, path: url.pathname + url.search };
          } catch {
            return {
              origin:
                typeof window !== 'undefined' ? window.location.origin : '',
              path: value,
            };
          }
        })()
      : { origin: '', path: '' };

  const pageTimeseriesQuery = useQuery(
    trpc.event.pageTimeseries.queryOptions(
      { projectId, ...dateInput, origin: pageOrigin, path: pagePath },
      { enabled: type === 'page' && !!pagePath }
    )
  );

  const data = type === 'page' ? pageQuery.data : queryQuery.data;
  const isLoading =
    type === 'page' ? pageQuery.isLoading : queryQuery.isLoading;

  const timeseries = data?.timeseries ?? [];
  const pageTimeseries = pageTimeseriesQuery.data ?? [];
  const breakdownRows =
    type === 'page'
      ? ((data as { queries?: unknown[] } | undefined)?.queries ?? [])
      : ((data as { pages?: unknown[] } | undefined)?.pages ?? []);

  const breakdownKey = type === 'page' ? 'query' : 'page';
  const breakdownLabel = type === 'page' ? 'Query' : 'Page';

  const maxClicks = Math.max(
    ...(breakdownRows as { clicks: number }[]).map((r) => r.clicks),
    1
  );

  return (
    <SheetContent className="flex flex-col gap-6 overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle className="truncate pr-8 font-medium font-mono text-sm">
          {value}
        </SheetTitle>
      </SheetHeader>

      <div className="col gap-6">
        {type === 'page' && (
          <div className="card p-4">
            <h3 className="mb-4 font-medium text-sm">Views & Sessions</h3>
            {isLoading || pageTimeseriesQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <OPLineChart
                data={pageTimeseries.map((row) => ({
                  date: row.date,
                  views: row.pageviews,
                }))}
                height={CHART_HEIGHT}
                interval={interval}
                series={VIEWS_SERIES}
              />
            )}
          </div>
        )}

        <div className="card p-4">
          <h3 className="mb-4 font-medium text-sm">Clicks & Impressions</h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <OPLineChart
              data={timeseries.map((row) => ({
                date: row.date,
                clicks: row.clicks,
                impressions: row.impressions,
              }))}
              height={CHART_HEIGHT}
              interval={interval}
              series={GSC_CLICKS_SERIES}
            />
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b p-4">
            <h3 className="font-medium text-sm">
              Top {breakdownLabel.toLowerCase()}s
            </h3>
          </div>
          {isLoading ? (
            <OverviewWidgetTable
              columns={[
                {
                  name: breakdownLabel,
                  width: 'w-full',
                  render: () => <Skeleton className="h-4 w-2/3" />,
                },
                {
                  name: 'Clicks',
                  width: '70px',
                  render: () => <Skeleton className="h-4 w-10" />,
                },
                {
                  name: 'Pos.',
                  width: '55px',
                  render: () => <Skeleton className="h-4 w-8" />,
                },
              ]}
              data={[1, 2, 3, 4, 5]}
              getColumnPercentage={() => 0}
              keyExtractor={(i) => String(i)}
            />
          ) : (
            <OverviewWidgetTable
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
              data={breakdownRows as Record<string, string | number>[]}
              getColumnPercentage={(item) =>
                (item.clicks as number) / maxClicks
              }
              keyExtractor={(item) => String(item[breakdownKey])}
            />
          )}
        </div>
      </div>
    </SheetContent>
  );
}
