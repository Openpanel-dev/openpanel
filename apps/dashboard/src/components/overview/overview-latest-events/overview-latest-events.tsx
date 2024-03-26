'use client';

import { LazyChart } from '@/components/report/chart/LazyChart';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../../widget';
import { WidgetButtons, WidgetHead } from '../overview-widget';
import { useOverviewOptions } from '../useOverviewOptions';
import { useOverviewWidget } from '../useOverviewWidget';

export interface OverviewLatestEventsProps {
  projectId: string;
  conversions: string[];
}
export default function OverviewLatestEvents({
  projectId,
  conversions,
}: OverviewLatestEventsProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [widget, setWidget, widgets] = useOverviewWidget('ev', {
    all: {
      title: 'Top events',
      btn: 'All',
      chart: {
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: [
              ...filters,
              {
                id: 'ex_session',
                name: 'name',
                operator: 'isNot',
                value: ['session_start', 'session_end'],
              },
            ],
            id: 'A',
            name: '*',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'name',
          },
        ],
        chartType: 'bar',
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    conversions: {
      title: 'Conversions',
      btn: 'Conversions',
      hide: conversions.length === 0,
      chart: {
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: [
              ...filters,
              {
                id: 'conversion',
                name: 'name',
                operator: 'is',
                value: conversions,
              },
            ],
            id: 'A',
            name: '*',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'name',
          },
        ],
        chartType: 'bar',
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
  });

  return (
    <>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">{widget.title}</div>
          <WidgetButtons>
            {widgets
              .filter((item) => item.hide !== true)
              .map((w) => (
                <button
                  key={w.key}
                  onClick={() => setWidget(w.key)}
                  className={cn(w.key === widget.key && 'active')}
                >
                  {w.btn}
                </button>
              ))}
          </WidgetButtons>
        </WidgetHead>
        <WidgetBody>
          <LazyChart hideID {...widget.chart} previous={false} />
        </WidgetBody>
      </Widget>
    </>
  );
}
