import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useMemo, useState } from 'react';

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartType } from '@openpanel/validation';

import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useQuery } from '@tanstack/react-query';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Widget, WidgetBody } from '../widget';
import { OVERVIEW_COLUMNS_NAME } from './overview-constants';
import OverviewDetailsButton from './overview-details-button';
import {
  OverviewLineChart,
  OverviewLineChartLoading,
} from './overview-line-chart';
import { OverviewViewToggle, useOverviewView } from './overview-view-toggle';
import { WidgetFooter, WidgetHeadSearchable } from './overview-widget';
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
  const [chartType] = useState<IChartType>('bar');
  const [searchQuery, setSearchQuery] = useState('');
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
          series: [
            {
              type: 'event',
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
          series: [
            {
              type: 'event',
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
          series: [
            {
              type: 'event',
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
          series: [
            {
              type: 'event',
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
          series: [
            {
              type: 'event',
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
          series: [
            {
              type: 'event',
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
          series: [
            {
              type: 'event',
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

  const trpc = useTRPC();
  const [view] = useOverviewView();

  const query = useQuery(
    trpc.overview.topGeneric.queryOptions({
      projectId,
      range,
      filters,
      column: widget.key,
      startDate,
      endDate,
    }),
  );

  const seriesQuery = useQuery(
    trpc.overview.topGenericSeries.queryOptions(
      {
        projectId,
        range,
        filters,
        column: widget.key,
        startDate,
        endDate,
        interval,
      },
      {
        enabled: view === 'chart',
      },
    ),
  );

  const filteredData = useMemo(() => {
    const data = (query.data ?? []).slice(0, 15);
    if (!searchQuery.trim()) {
      return data;
    }
    const queryLower = searchQuery.toLowerCase();
    return data.filter((item) => item.name?.toLowerCase().includes(queryLower));
  }, [query.data, searchQuery]);

  const tabs = widgets.map((w) => ({
    key: w.key,
    label: w.btn,
  }));

  return (
    <>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHeadSearchable
          tabs={tabs}
          activeTab={widget.key}
          onTabChange={setWidget}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={`Search ${widget.btn.toLowerCase()}`}
          className="border-b-0 pb-2"
        />
        <WidgetBody className="p-0">
          {view === 'chart' ? (
            seriesQuery.isLoading ? (
              <OverviewLineChartLoading />
            ) : seriesQuery.data ? (
              <OverviewLineChart
                data={seriesQuery.data}
                interval={interval}
                searchQuery={searchQuery}
              />
            ) : (
              <OverviewLineChartLoading />
            )
          ) : query.isLoading ? (
            <OverviewWidgetTableLoading />
          ) : (
            <OverviewWidgetTableGeneric
              data={filteredData}
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
          <div className="flex-1" />
          <OverviewViewToggle />
        </WidgetFooter>
      </Widget>
    </>
  );
}
