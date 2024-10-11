'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import type { IChartProps } from '@openpanel/validation';

import { ReportChart } from '../report-chart';
import { OverviewLiveHistogram } from './overview-live-histogram';

interface OverviewMetricsProps {
  projectId: string;
}

export default function OverviewMetrics({ projectId }: OverviewMetricsProps) {
  const { previous, range, interval, metric, setMetric, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const reports = [
    {
      id: 'Visitors',
      projectId,
      startDate,
      endDate,
      events: [
        {
          segment: 'user',
          filters,
          id: 'A',
          name: isPageFilter ? 'screen_view' : 'session_start',
          displayName: 'Visitors',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Visitors',
      range,
      previous,
      metric: 'sum',
    },
    {
      id: 'Sessions',
      projectId,
      startDate,
      endDate,
      events: [
        {
          segment: 'session',
          filters,
          id: 'A',
          name: isPageFilter ? 'screen_view' : 'session_start',
          displayName: 'Sessions',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Sessions',
      range,
      previous,
      metric: 'sum',
    },
    {
      id: 'Pageviews',
      projectId,
      startDate,
      endDate,
      events: [
        {
          segment: 'event',
          filters,
          id: 'A',
          name: 'screen_view',
          displayName: 'Pageviews',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Pageviews',
      range,
      previous,
      metric: 'sum',
    },
    {
      id: 'Views per session',
      projectId,
      startDate,
      endDate,
      events: [
        {
          segment: 'user_average',
          filters,
          id: 'A',
          name: 'screen_view',
          displayName: 'Views per session',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Views per session',
      range,
      previous,
      metric: 'average',
    },
    {
      id: 'Bounce rate',
      projectId,
      startDate,
      endDate,
      events: [
        {
          segment: 'event',
          filters: [
            {
              id: '1',
              name: 'properties.__bounce',
              operator: 'is',
              value: ['true'],
            },
            ...filters,
          ],
          id: 'A',
          name: 'session_end',
          displayName: 'Bounce rate',
        },
        {
          segment: 'event',
          filters: filters,
          id: 'B',
          name: 'session_end',
          displayName: 'Bounce rate',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Bounce rate',
      range,
      previous,
      previousIndicatorInverted: true,
      formula: 'A/B*100',
      metric: 'average',
      unit: '%',
      maxDomain: 100,
    },
    {
      id: 'Visit duration',
      projectId,
      startDate,
      endDate,
      events: [
        {
          segment: 'property_average',
          filters: [
            {
              name: 'duration',
              operator: 'isNot',
              value: ['0'],
              id: 'A',
            },
            ...filters,
          ],
          id: 'A',
          property: 'duration',
          name: isPageFilter ? 'screen_view' : 'session_end',
          displayName: isPageFilter ? 'Time on page' : 'Visit duration',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Visit duration',
      range,
      previous,
      formula: 'A/1000',
      metric: 'average',
      unit: 'min',
    },
  ] satisfies (IChartProps & { id: string; maxDomain?: number })[];

  const selectedMetric = reports[metric]!;

  return (
    <>
      <div className="relative -top-0.5 col-span-6 -m-4 mb-0 mt-0 md:m-0">
        <div className="card mb-2 grid grid-cols-4 overflow-hidden rounded-md">
          {reports.map((report, index) => (
            <button
              type="button"
              key={report.id}
              className={cn(
                'col-span-2 flex-1 shadow-[0_0_0_0.5px] shadow-border md:col-span-1',
                index === metric && 'bg-def-100',
              )}
              onClick={() => {
                setMetric(index);
              }}
            >
              <ReportChart report={report} options={{ hideID: true }} />
            </button>
          ))}
          <div
            className={cn(
              'col-span-4 min-h-16 flex-1 p-4 pb-0 shadow-[0_0_0_0.5px] shadow-border max-md:row-start-1 md:col-span-2',
            )}
          >
            <OverviewLiveHistogram projectId={projectId} />
          </div>
        </div>
        <div className="card col-span-6 p-4">
          <ReportChart
            key={selectedMetric.id}
            options={{
              hideID: true,
              maxDomain: selectedMetric.maxDomain,
              aspectRatio: 0.2,
              hideLegend: true,
            }}
            report={{
              ...selectedMetric,
              chartType: 'linear',
              lineType: 'linear',
            }}
          />
        </div>
      </div>
    </>
  );
}
