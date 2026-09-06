import type { IChartType } from '@openpanel/core/modules/report/report.constants';
import { NOT_SET_VALUE } from '@openpanel/core/modules/report/report.constants';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Widget, WidgetBody } from '../widget';
import { OVERVIEW_COLUMNS_NAME } from './overview-constants';
import OverviewDetailsButton from './overview-details-button';
import {
  OverviewLineChart,
  OverviewLineChartLoading,
} from './overview-line-chart';
import { OverviewMap } from './overview-map';
import { OverviewViewToggle, useOverviewView } from './overview-view-toggle';
import {
  WidgetFooter,
  WidgetHead,
  WidgetHeadSearchable,
} from './overview-widget';
import {
  OverviewWidgetTableGeneric,
  OverviewWidgetTableLoading,
} from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidgetV2 } from './useOverviewWidget';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { countries } from '@/translations/countries';

interface OverviewTopGeoProps {
  projectId: string;
  shareId?: string;
}
export default function OverviewTopGeo({
  projectId,
  shareId,
}: OverviewTopGeoProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
  const [searchQuery, setSearchQuery] = useState('');
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const [widget, setWidget, widgets] = useOverviewWidgetV2('geo', {
    country: {
      title: 'Top countries',
      btn: 'Countries',
    },
    region: {
      title: 'Top regions',
      btn: 'Regions',
    },
    city: {
      title: 'Top cities',
      btn: 'Cities',
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
    return data.filter(
      (item) =>
        item.name?.toLowerCase().includes(queryLower) ||
        item.prefix?.toLowerCase().includes(queryLower) ||
        countries[item.name as keyof typeof countries]
          ?.toLowerCase()
          .includes(queryLower)
    );
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
                      <SerieIcon
                        name={item.prefix || item.name || NOT_SET_VALUE}
                      />
                      <button
                        className="truncate"
                        onClick={() => {
                          if (widget.key === 'country') {
                            setWidget('region');
                          } else if (widget.key === 'region') {
                            setWidget('city');
                          }
                          setFilter(widget.key, item.name);
                        }}
                        type="button"
                      >
                        {item.prefix && (
                          <span className="row mr-1 inline-flex items-center gap-1">
                            <span>
                              {countries[
                                item.prefix as keyof typeof countries
                              ] ?? item.prefix}
                            </span>
                            <span>
                              <ChevronRightIcon className="size-3" />
                            </span>
                          </span>
                        )}
                        {(countries[item.name as keyof typeof countries] ??
                          item.name) ||
                          'Not set'}
                      </button>
                    </div>
                  );
                },
              }}
              data={filteredData}
            />
          )}
        </WidgetBody>
        <WidgetFooter className="row items-center justify-between">
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
          <span className="ml-2 pr-2 text-muted-foreground text-sm">
            Geo data provided by{' '}
            <a
              className="hover:underline"
              href="https://ipdata.co"
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              MaxMind
            </a>
          </span>
        </WidgetFooter>
      </Widget>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">Map</div>
        </WidgetHead>
        <WidgetBody>
          <OverviewMap projectId={projectId} shareId={shareId} />
        </WidgetBody>
      </Widget>
    </>
  );
}
