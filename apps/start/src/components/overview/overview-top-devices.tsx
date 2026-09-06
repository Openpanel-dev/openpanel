import type { IChartType } from '@openpanel/core/modules/report/report.constants';
import { NOT_SET_VALUE } from '@openpanel/core/modules/report/report.constants';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

interface OverviewTopDevicesProps {
  projectId: string;
  shareId?: string;
}
export default function OverviewTopDevices({
  projectId,
  shareId,
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
          interval,
          name: 'Top devices',
          range,
          previous,
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
          interval,
          name: 'Top browser',
          range,
          previous,
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
          interval,
          name: 'Top Browser Version',
          range,
          previous,
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
          interval,
          name: 'Top OS',
          range,
          previous,
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
          interval,
          name: 'Top OS version',
          range,
          previous,
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
          interval,
          name: 'Top Brands',
          range,
          previous,
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
          interval,
          name: 'Top Models',
          range,
          previous,
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
      shareId,
      range,
      filters,
      column: widget.key,
      startDate,
      endDate,
    })
  );

  const seriesQuery = useQuery(
    trpc.overview.topGenericSeries.queryOptions(
      {
        projectId,
        shareId,
        range,
        filters,
        column: widget.key,
        startDate,
        endDate,
        interval,
      },
      {
        enabled: view === 'chart',
      }
    )
  );

  const filteredData = useMemo(() => {
    const data = query.data ?? [];
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
          activeTab={widget.key}
          className="border-b-0 pb-2"
          onSearchChange={setSearchQuery}
          onTabChange={setWidget}
          searchPlaceholder={`Search ${widget.btn.toLowerCase()}`}
          searchValue={searchQuery}
          tabs={tabs}
        />
        <WidgetBody className="p-0">
          {view === 'chart' ? (
            seriesQuery.isLoading ? (
              <OverviewLineChartLoading />
            ) : seriesQuery.data ? (
              <OverviewLineChart
                data={seriesQuery.data}
                interval={interval}
                range={range}
                searchQuery={searchQuery}
              />
            ) : (
              <OverviewLineChartLoading />
            )
          ) : query.isLoading ? (
            <OverviewWidgetTableLoading />
          ) : (
            <OverviewWidgetTableGeneric
              column={{
                name: OVERVIEW_COLUMNS_NAME[widget.key],
                render(item) {
                  return (
                    <div className="row relative min-w-0 items-center gap-2">
                      <SerieIcon name={item.name || NOT_SET_VALUE} />
                      <button
                        className="truncate"
                        onClick={() => {
                          setFilter(widget.key, item.name);
                        }}
                        type="button"
                      >
                        {item.name || 'Not set'}
                      </button>
                    </div>
                  );
                },
              }}
              data={filteredData}
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
