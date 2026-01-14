import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useMemo, useState } from 'react';

import type { IReportInput } from '@openpanel/validation';

import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Widget, WidgetBody } from '../widget';
import { WidgetFooter, WidgetHeadSearchable } from './overview-widget';
import {
  type EventTableItem,
  OverviewWidgetTableEvents,
  OverviewWidgetTableLoading,
} from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidgetV2 } from './useOverviewWidget';

export interface OverviewTopEventsProps {
  projectId: string;
}

export default function OverviewTopEvents({
  projectId,
}: OverviewTopEventsProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const trpc = useTRPC();
  const { data: conversions } = useQuery(
    trpc.event.conversionNames.queryOptions({ projectId }),
  );
  const [searchQuery, setSearchQuery] = useState('');

  const [widget, setWidget, widgets] = useOverviewWidgetV2('ev', {
    your: {
      title: 'Events',
      btn: 'Events',
      meta: {
        filters: [
          {
            id: 'ex_session',
            name: 'name',
            operator: 'isNot',
            value: ['session_start', 'session_end', 'screen_view'],
          },
        ],
        eventName: '*',
      },
    },
    conversions: {
      title: 'Conversions',
      btn: 'Conversions',
      hide: !conversions || conversions.length === 0,
      meta: {
        filters: [
          {
            id: 'conversion',
            name: 'name',
            operator: 'is',
            value: conversions?.map((c) => c.name) ?? [],
          },
        ],
        eventName: '*',
      },
    },
    link_out: {
      title: 'Link out',
      btn: 'Link out',
      meta: {
        filters: [],
        eventName: 'link_out',
        breakdownProperty: 'properties.href',
      },
    },
  });

  const report: IReportInput = useMemo(
    () => ({
      limit: 1000,
      projectId,
      startDate,
      endDate,
      series: [
        {
          type: 'event' as const,
          segment: 'event' as const,
          filters: [...filters, ...(widget.meta?.filters ?? [])],
          id: 'A',
          name: widget.meta?.eventName ?? '*',
        },
      ],
      breakdowns: [
        {
          id: 'A',
          name: widget.meta?.breakdownProperty ?? 'name',
        },
      ],
      chartType: 'bar' as const,
      interval,
      range,
      previous,
      metric: 'sum' as const,
    }),
    [projectId, startDate, endDate, filters, widget, interval, range, previous],
  );

  const query = useQuery(trpc.chart.aggregate.queryOptions(report));

  const tableData: EventTableItem[] = useMemo(() => {
    if (!query.data?.series) return [];

    return query.data.series.map((serie) => ({
      id: serie.id,
      name: serie.names[serie.names.length - 1] ?? serie.names[0] ?? '',
      count: serie.metrics.sum,
    }));
  }, [query.data]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return tableData.slice(0, 15);
    }
    const queryLower = searchQuery.toLowerCase();
    return tableData
      .filter((item) => item.name?.toLowerCase().includes(queryLower))
      .slice(0, 15);
  }, [tableData, searchQuery]);

  const tabs = useMemo(
    () =>
      widgets
        .filter((item) => item.hide !== true)
        .map((w) => ({
          key: w.key,
          label: w.btn,
        })),
    [widgets],
  );

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
          {query.isLoading ? (
            <OverviewWidgetTableLoading />
          ) : (
            <OverviewWidgetTableEvents
              data={filteredData}
              onItemClick={(name) => {
                if (widget.meta?.breakdownProperty) {
                  setFilter(widget.meta.breakdownProperty, name);
                } else {
                  setFilter('name', name);
                }
              }}
            />
          )}
        </WidgetBody>
        <WidgetFooter>
          <div className="flex-1" />
        </WidgetFooter>
      </Widget>
    </>
  );
}
