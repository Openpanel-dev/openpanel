'use client';

import { Suspense } from 'react';
import { Chart } from '@/components/report/chart';
import { ChartLoading } from '@/components/report/chart/ChartLoading';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../Widget';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopGeoProps {
  projectId: string;
}
export default function OverviewTopGeo({ projectId }: OverviewTopGeoProps) {
  const { filters, interval, range, previous, setCountry, setRegion, setCity } =
    useOverviewOptions();
  const [widget, setWidget, widgets] = useOverviewWidget('geo', {
    map: {
      title: 'Map',
      btn: 'Map',
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
            name: 'country',
          },
        ],
        chartType: 'map',
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    countries: {
      title: 'Top countries',
      btn: 'Countries',
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
            name: 'country',
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
    regions: {
      title: 'Top regions',
      btn: 'Regions',
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
            name: 'region',
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
    cities: {
      title: 'Top cities',
      btn: 'Cities',
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
            name: 'city',
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
        <WidgetHead className="flex items-center justify-between">
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
          <Suspense fallback={<ChartLoading />}>
            <Chart
              hideID
              {...widget.chart}
              previous={false}
              onClick={(item) => {
                switch (widget.key) {
                  case 'countries':
                    setWidget('regions');
                    setCountry(item.name);
                    break;
                  case 'regions':
                    setWidget('cities');
                    setRegion(item.name);
                    break;
                  case 'cities':
                    setCity(item.name);
                    break;
                }
              }}
            />
          </Suspense>
        </WidgetBody>
      </Widget>
    </>
  );
}
