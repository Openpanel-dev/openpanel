'use client';

import { Suspense } from 'react';
import { Chart } from '@/components/report/chart';
import { ChartLoading } from '@/components/report/chart/ChartLoading';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../Widget';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopPagesProps {
  projectId: string;
}
export default function OverviewTopPages({ projectId }: OverviewTopPagesProps) {
  const { filters, interval, range, previous, setPage } = useOverviewOptions();
  const [widget, setWidget, widgets] = useOverviewWidget('pages', {
    top: {
      title: 'Top pages',
      btn: 'Top pages',
      chart: {
        projectId,
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
        chartType: 'bar',
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
        chartType: 'bar',
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
        chartType: 'bar',
        lineType: 'monotone',
        interval,
        name: 'Top sources',
        range,
        previous,
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
          <Chart
            hideID
            {...widget.chart}
            previous={false}
            onClick={(item) => {
              setPage(item.name);
            }}
          />
        </WidgetBody>
      </Widget>
    </>
  );
}
