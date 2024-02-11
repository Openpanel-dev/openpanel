'use client';

import { Suspense } from 'react';
import { Chart } from '@/components/report/chart';
import { ChartLoading } from '@/components/report/chart/ChartLoading';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../Widget';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

export default function OverviewTopDevices() {
  const {
    filters,
    interval,
    range,
    previous,
    setBrowser,
    setBrowserVersion,
    browser,
    browserVersion,
    setOS,
    setOSVersion,
    os,
    osVersion,
  } = useOverviewOptions();
  const [widget, setWidget, widgets] = useOverviewWidget('tech', {
    devices: {
      title: 'Top devices',
      btn: 'Devices',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'user',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'device',
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
    browser: {
      title: 'Top browser',
      btn: 'Browser',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'user',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'browser',
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
    browser_version: {
      title: 'Top Browser Version',
      btn: 'Browser Version',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'user',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'browser_version',
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
    os: {
      title: 'Top OS',
      btn: 'OS',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'user',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'os',
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
    os_version: {
      title: 'Top OS version',
      btn: 'OS Version',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'user',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'os_version',
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
                  case 'browser':
                    setWidget('browser_version');
                    setBrowser(item.name);
                    break;
                  case 'browser_version':
                    setBrowserVersion(item.name);
                    break;
                  case 'os':
                    setWidget('os_version');
                    setOS(item.name);
                    break;
                  case 'os_version':
                    setOSVersion(item.name);
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
