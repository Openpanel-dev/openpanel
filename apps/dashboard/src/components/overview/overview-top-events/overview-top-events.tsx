'use client';

import { ChartSwitch } from '@/components/report/chart';
import { Button } from '@/components/ui/button';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { BarChartIcon, LineChart, LineChartIcon } from 'lucide-react';

import { Widget, WidgetBody } from '../../Widget';
import { OverviewChartToggle } from '../overview-chart-toggle';
import { WidgetButtons, WidgetHead } from '../overview-widget';
import { useOverviewOptions } from '../useOverviewOptions';
import { useOverviewWidget } from '../useOverviewWidget';

export interface OverviewTopEventsProps {
  projectId: string;
  conversions: string[];
}
export default function OverviewTopEvents({
  projectId,
  conversions,
}: OverviewTopEventsProps) {
  const {
    interval,
    range,
    previous,
    startDate,
    endDate,
    chartType,
    setChartType,
  } = useOverviewOptions();
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
        chartType: chartType,
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
        chartType: chartType,
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
          <div className="title">
            {widget.title}
            <OverviewChartToggle />
          </div>
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
          <ChartSwitch hideID {...widget.chart} previous={false} />
        </WidgetBody>
      </Widget>
    </>
  );
}
