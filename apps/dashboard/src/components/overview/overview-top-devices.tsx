'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { useState } from 'react';

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartType } from '@openpanel/validation';

import { useNumber } from '@/hooks/useNumerFormatter';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Widget, WidgetBody } from '../widget';
import { OVERVIEW_COLUMNS_NAME } from './overview-constants';
import OverviewDetailsButton from './overview-details-button';
import { WidgetButtons, WidgetFooter, WidgetHead } from './overview-widget';
import {
  OverviewWidgetTableGeneric,
  OverviewWidgetTableLoading,
} from './overview-widget-table';
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
    device: {
      title: 'Top devices',
      btn: 'Devices',
      chart: {
        options: {
          columns: ['Device', isPageFilter ? 'Views' : 'Sessions'],
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
        options: {
          columns: ['Browser', isPageFilter ? 'Views' : 'Sessions'],
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
          columns: ['Version', isPageFilter ? 'Views' : 'Sessions'],
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
        options: {
          columns: ['OS', isPageFilter ? 'Views' : 'Sessions'],
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
          columns: ['Version', isPageFilter ? 'Views' : 'Sessions'],
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
    brand: {
      title: 'Top Brands',
      btn: 'Brands',
      chart: {
        options: {
          columns: ['Brand', isPageFilter ? 'Views' : 'Sessions'],
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
    model: {
      title: 'Top Models',
      btn: 'Models',
      chart: {
        options: {
          columns: ['Model', isPageFilter ? 'Views' : 'Sessions'],
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

  const number = useNumber();

  const query = api.overview.topGeneric.useQuery({
    projectId,
    interval,
    range,
    filters,
    column: widget.key,
    startDate,
    endDate,
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
        <WidgetBody className="p-0">
          {query.isLoading ? (
            <OverviewWidgetTableLoading />
          ) : (
            <OverviewWidgetTableGeneric
              data={query.data ?? []}
              column={{
                name: OVERVIEW_COLUMNS_NAME[widget.key],
                render(item) {
                  return (
                    <div className="row items-center gap-2 min-w-0 relative">
                      <SerieIcon name={item.name || NOT_SET_VALUE} />
                      <button
                        type="button"
                        className="truncate"
                        onClick={() => {
                          setFilter(widget.key, item.name);
                        }}
                      >
                        {item.name || 'Not set'}
                      </button>
                    </div>
                  );
                },
              }}
            />
          )}
        </WidgetBody>
        <WidgetFooter>
          <OverviewDetailsButton
            onClick={() =>
              pushModal('OverviewTopGenericModal', {
                projectId,
                column: widget.key,
              })
            }
          />
          {/* <OverviewChartToggle {...{ chartType, setChartType }} /> */}
        </WidgetFooter>
      </Widget>
    </>
  );
}
