'use client';

import { ChartSwitch } from '@/components/report/chart';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../widget';
import { OverviewChartToggle } from './overview-chart-toggle';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopDevicesProps {
  projectId: string;
}
export default function OverviewTopDevices({
  projectId,
}: OverviewTopDevicesProps) {
  const { interval, range, previous, startDate, endDate, chartType } =
    useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const [widget, setWidget, widgets] = useOverviewWidget('tech', {
    devices: {
      title: 'Top devices',
      btn: 'Devices',
      chart: {
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
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    browser: {
      title: 'Top browser',
      btn: 'Browser',
      chart: {
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
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    browser_version: {
      title: 'Top Browser Version',
      btn: 'Browser Version',
      chart: {
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
            name: 'browser_version',
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
    os: {
      title: 'Top OS',
      btn: 'OS',
      chart: {
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
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    os_version: {
      title: 'Top OS version',
      btn: 'OS Version',
      chart: {
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
            name: 'os_version',
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
            <OverviewChartToggle />
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
          <ChartSwitch
            hideID
            {...widget.chart}
            previous={false}
            onClick={(item) => {
              switch (widget.key) {
                case 'devices':
                  setFilter('device', item.name);
                  break;
                case 'browser':
                  setFilter('browser', item.name);
                  break;
                case 'browser_version':
                  setFilter('browser_version', item.name);
                  break;
                case 'os':
                  setFilter('os', item.name);
                  break;
                case 'os_version':
                  setFilter('os_version', item.name);
                  break;
              }
            }}
          />
        </WidgetBody>
      </Widget>
    </>
  );
}
