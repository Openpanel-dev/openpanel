'use client';

import { useState } from 'react';
import { LazyChart } from '@/components/report/chart/LazyChart';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import type { IChartType } from '@openpanel/validation';

import { Widget, WidgetBody } from '../../widget';
import { OverviewChartToggle } from '../overview-chart-toggle';
import OverviewDetailsButton from '../overview-details-button';
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
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [widget, setWidget, widgets] = useOverviewWidget('ev', {
    your: {
      title: 'Top events',
      btn: 'Your',
      chart: {
        limit: 10,
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
                value: ['session_start', 'session_end', 'screen_view'],
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
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    all: {
      title: 'Top events',
      btn: 'All',
      chart: {
        limit: 10,
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: [...filters],
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
        chartType,
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
        limit: 10,
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
        chartType,
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
            <OverviewChartToggle {...{ chartType, setChartType }} />
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
          <LazyChart hideID {...widget.chart} previous={false} />
          <OverviewDetailsButton chart={widget.chart} />
        </WidgetBody>
      </Widget>
    </>
  );
}
