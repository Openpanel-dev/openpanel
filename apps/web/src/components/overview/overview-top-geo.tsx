'use client';

import { ChartSwitch } from '@/components/report/chart';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../Widget';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopGeoProps {
  projectId: string;
}
export default function OverviewTopGeo({ projectId }: OverviewTopGeoProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const [widget, setWidget, widgets] = useOverviewWidget('geo', {
    countries: {
      title: 'Top countries',
      btn: 'Countries',
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
          <ChartSwitch
            hideID
            {...widget.chart}
            previous={false}
            onClick={(item) => {
              switch (widget.key) {
                case 'countries':
                  setWidget('regions');
                  setFilter('country', item.name);
                  break;
                case 'regions':
                  setWidget('cities');
                  setFilter('region', item.name);
                  break;
                case 'cities':
                  setFilter('city', item.name);
                  break;
              }
            }}
          />
        </WidgetBody>
      </Widget>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">Map</div>
        </WidgetHead>
        <WidgetBody>
          <ChartSwitch
            hideID
            {...{
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
            }}
          />
        </WidgetBody>
      </Widget>
    </>
  );
}
