import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useMemo, useState } from 'react';

import type { IChartType } from '@openpanel/validation';

import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { countries } from '@/translations/countries';
import { NOT_SET_VALUE } from '@openpanel/constants';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { ReportChart } from '../report-chart';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { ReportChartShortcut } from '../report-chart/shortcut';
import { Widget, WidgetBody } from '../widget';
import { OVERVIEW_COLUMNS_NAME } from './overview-constants';
import OverviewDetailsButton from './overview-details-button';
import {
  OverviewLineChart,
  OverviewLineChartLoading,
} from './overview-line-chart';
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

interface OverviewTopGeoProps {
  projectId: string;
}
export default function OverviewTopGeo({ projectId }: OverviewTopGeoProps) {
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
    return data.filter(
      (item) =>
        item.name?.toLowerCase().includes(queryLower) ||
        item.prefix?.toLowerCase().includes(queryLower) ||
        countries[item.name as keyof typeof countries]
          ?.toLowerCase()
          .includes(queryLower),
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
                      <SerieIcon
                        name={item.prefix || item.name || NOT_SET_VALUE}
                      />
                      <button
                        type="button"
                        className="truncate"
                        onClick={() => {
                          if (widget.key === 'country') {
                            setWidget('region');
                          } else if (widget.key === 'region') {
                            setWidget('city');
                          }
                          setFilter(widget.key, item.name);
                        }}
                      >
                        {item.prefix && (
                          <span className="mr-1 row inline-flex items-center gap-1">
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
          <span className="text-sm text-muted-foreground pr-2 ml-2">
            Geo data provided by{' '}
            <a
              href="https://ipdata.co"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="hover:underline"
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
          <ReportChartShortcut
            {...{
              projectId,
              startDate,
              endDate,
              series: [
                {
                  type: 'event',
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
              interval: interval,
              range: range,
              previous: previous,
            }}
          />
        </WidgetBody>
      </Widget>
    </>
  );
}
