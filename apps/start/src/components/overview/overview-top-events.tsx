import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useMemo, useState } from 'react';

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
  shareId?: string;
}

export default function OverviewTopEvents({
  projectId,
  shareId,
}: OverviewTopEventsProps) {
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const trpc = useTRPC();
  const { data: conversions } = useQuery(
    trpc.overview.topConversions.queryOptions({ projectId, shareId }),
  );
  const [searchQuery, setSearchQuery] = useState('');

  const [widget, setWidget, widgets] = useOverviewWidgetV2('ev', {
    your: {
      title: 'Events',
      btn: 'Events',
      meta: {
        type: 'events' as const,
      },
    },
    conversions: {
      title: 'Conversions',
      btn: 'Conversions',
      hide: !conversions || conversions.length === 0,
      meta: {
        type: 'conversions' as const,
      },
    },
    link_out: {
      title: 'Link out',
      btn: 'Link out',
      meta: {
        type: 'linkOut' as const,
      },
    },
  });

  // Use different endpoints based on widget type
  const eventsQuery = useQuery(
    trpc.overview.topEvents.queryOptions({
      projectId,
      shareId,
      range,
      startDate,
      endDate,
      filters,
      excludeEvents:
        widget.meta?.type === 'events'
          ? ['session_start', 'session_end', 'screen_view']
          : undefined,
    }),
  );

  const linkOutQuery = useQuery(
    trpc.overview.topLinkOut.queryOptions({
      projectId,
      shareId,
      range,
      startDate,
      endDate,
      filters,
    }),
  );

  const tableData: EventTableItem[] = useMemo(() => {
    // For link out, use href as name
    if (widget.meta?.type === 'linkOut') {
      if (!linkOutQuery.data) return [];
      return linkOutQuery.data.map((item) => ({
        id: item.href,
        name: item.href,
        count: item.count,
      }));
    }

    // For events and conversions
    if (!eventsQuery.data) return [];

    // For conversions, filter events by conversion names (client-side filtering)
    if (widget.meta?.type === 'conversions' && conversions) {
      const conversionNames = new Set(conversions.map((c) => c.name));
      return eventsQuery.data
        .filter((item) => conversionNames.has(item.name))
        .map((item) => ({
          id: item.name,
          name: item.name,
          count: item.count,
        }));
    }

    // For regular events
    return eventsQuery.data.map((item) => ({
      id: item.name,
      name: item.name,
      count: item.count,
    }));
  }, [eventsQuery.data, linkOutQuery.data, widget.meta?.type, conversions]);

  // Determine which query's loading state to use
  const isLoading =
    widget.meta?.type === 'linkOut'
      ? linkOutQuery.isLoading
      : eventsQuery.isLoading;

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return tableData;
    }
    const queryLower = searchQuery.toLowerCase();
    return tableData.filter((item) =>
      item.name?.toLowerCase().includes(queryLower),
    );
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
          {isLoading ? (
            <OverviewWidgetTableLoading />
          ) : (
            <OverviewWidgetTableEvents
              data={filteredData}
              onItemClick={(name) => {
                if (widget.meta?.type === 'linkOut') {
                  setFilter('properties.href', name);
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
