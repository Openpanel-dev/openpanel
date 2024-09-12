'use client';

import { useState } from 'react';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartType } from '@openpanel/validation';

import { ReportChart } from '../report-chart';
import { Widget, WidgetBody } from '../widget';
import { OverviewChartToggle } from './overview-chart-toggle';
import OverviewDetailsButton from './overview-details-button';
import { WidgetButtons, WidgetFooter, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopDevicesProps {
  projectId: string;
}
export default function OverviewTopDevices({
  projectId,
}: OverviewTopDevicesProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const [widget, setWidget, widgets] = useOverviewWidget('tech', {
    devices: {
      title: 'Top devices',
      btn: 'Devices',
      chart: {
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'device',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top devices',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    browser: {
      title: 'Top browser',
      btn: 'Browser',
      chart: {
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'browser',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top browser',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    browser_version: {
      title: 'Top Browser Version',
      btn: 'Browser Version',
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
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'browser',
            },
            {
              id: 'B',
              name: 'browser_version',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top Browser Version',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    os: {
      title: 'Top OS',
      btn: 'OS',
      chart: {
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'os',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top OS',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    os_version: {
      title: 'Top OS version',
      btn: 'OS Version',
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
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'os',
            },
            {
              id: 'B',
              name: 'os_version',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top OS version',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    brands: {
      title: 'Top Brands',
      btn: 'Brands',
      chart: {
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'brand',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top Brands',
          range: range,
          previous: previous,
          metric: 'sum',
        },
      },
    },
    models: {
      title: 'Top Models',
      btn: 'Models',
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
              segment: 'user',
              filters,
              id: 'A',
              name: isPageFilter ? 'screen_view' : 'session_start',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'brand',
            },
            {
              id: 'B',
              name: 'model',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval: interval,
          name: 'Top Models',
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
              ...widget.chart.options,
              hideID: true,
              onClick: (item) => {
                switch (widget.key) {
                  case 'devices':
                    setFilter('device', item.names[0]);
                    break;
                  case 'browser':
                    setFilter('browser', item.names[0]);
                    break;
                  case 'browser_version':
                    setFilter('browser_version', item.names[1]);
                    break;
                  case 'os':
                    setFilter('os', item.names[0]);
                    break;
                  case 'os_version':
                    setFilter('os_version', item.names[1]);
                    break;
                }
              },
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
    </>
  );
}
