'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { getCountry } from '@/translations/countries';
import { cn } from '@/utils/cn';
import { useState } from 'react';

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartType } from '@openpanel/validation';

import { ReportChart } from '../report-chart';
import { Widget, WidgetBody } from '../widget';
import { OverviewChartToggle } from './overview-chart-toggle';
import OverviewDetailsButton from './overview-details-button';
import { WidgetButtons, WidgetFooter, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopGeoProps {
  projectId: string;
}
export default function OverviewTopGeo({ projectId }: OverviewTopGeoProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const [widget, setWidget, widgets] = useOverviewWidget('geo', {
    countries: {
      title: 'Top countries',
      btn: 'Countries',
      chart: {
        options: {
          renderSerieName(name) {
            return getCountry(name[0]) || NOT_SET_VALUE;
          },
        },
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'event',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'country',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top countries',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    regions: {
      title: 'Top regions',
      btn: 'Regions',
      chart: {
        options: {
          renderSerieName(name) {
            return name[1] || NOT_SET_VALUE;
          },
        },
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'event',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'country',
            },
            {
              id: 'B',
              name: 'region',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top regions',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    cities: {
      title: 'Top cities',
      btn: 'Cities',
      chart: {
        options: {
          renderSerieName(name) {
            return name[1] || NOT_SET_VALUE;
          },
        },
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'event',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'country',
            },
            {
              id: 'B',
              name: 'city',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top cities',
          range: range,
          previous: previous,
          metric: 'sum',
        },
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
                type="button"
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
          <ReportChart
            options={{
              hideID: true,
              onClick: (item) => {
                switch (widget.key) {
                  case 'countries':
                    setWidget('regions');
                    setFilter('country', item.names[0]);
                    break;
                  case 'regions':
                    setWidget('cities');
                    setFilter('region', item.names[1]);
                    break;
                  case 'cities':
                    setFilter('city', item.names[1]);
                    break;
                }
              },
              ...widget.chart.options,
            }}
            report={{
              ...widget.chart.report,
              previous: false,
            }}
          />
        </WidgetBody>
        <WidgetFooter>
          <OverviewDetailsButton chart={widget.chart.report} />
          <OverviewChartToggle {...{ chartType, setChartType }} />
        </WidgetFooter>
      </Widget>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">Map</div>
        </WidgetHead>
        <WidgetBody>
          <ReportChart
            options={{ hideID: true }}
            report={{
              projectId,
              startDate,
              endDate,
              events: [
                {
                  segment: 'event',
                  filters,
                  id: 'A',
                  name: isPageFilter ? 'screen_view' : 'session_start',
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
