'use client';

import { useState } from 'react';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import type { IChartType } from '@openpanel/validation';

import { LazyChart } from '../report/chart/LazyChart';
import { Widget, WidgetBody } from '../widget';
import { OverviewChartToggle } from './overview-chart-toggle';
import OverviewDetailsButton from './overview-details-button';
import OverviewTopBots from './overview-top-bots';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopPagesProps {
  projectId: string;
}
export default function OverviewTopPages({ projectId }: OverviewTopPagesProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
  const [widget, setWidget, widgets] = useOverviewWidget('pages', {
    top: {
      title: 'Top pages',
      btn: 'Top pages',
      chart: {
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'screen_view',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'path',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval,
        name: 'Top sources',
        range,
        previous,
        metric: 'sum',
      },
    },
    entries: {
      title: 'Entry Pages',
      btn: 'Entries',
      chart: {
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'path',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval,
        name: 'Top sources',
        range,
        previous,
        metric: 'sum',
      },
    },
    exits: {
      title: 'Exit Pages',
      btn: 'Exits',
      chart: {
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_end',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'path',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval,
        name: 'Top sources',
        range,
        previous,
        metric: 'sum',
      },
    },
    bot: {
      title: 'Bots',
      btn: 'Bots',
      // @ts-expect-error
      chart: null,
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
            {widgets.map((w) => (
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
          {widget.key === 'bot' ? (
            <OverviewTopBots projectId={projectId} />
          ) : (
            <LazyChart
              hideID
              {...widget.chart}
              previous={false}
              onClick={(item) => {
                setFilter('path', item.name);
              }}
            />
          )}
          {widget.chart?.name && <OverviewDetailsButton chart={widget.chart} />}
        </WidgetBody>
      </Widget>
    </>
  );
}
