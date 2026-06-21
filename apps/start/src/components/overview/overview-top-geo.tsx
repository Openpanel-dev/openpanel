import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { IChartType } from '@openpanel/validation';

import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { countries } from '@/translations/countries';
import { NOT_SET_VALUE } from '@openpanel/constants';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Widget, WidgetBody } from '../widget';
import { getOverviewColumnName } from './overview-constants';
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

interface OverviewTopGeoProps {
  projectId: string;
  shareId?: string;
}
export default function OverviewTopGeo({
  projectId,
  shareId,
}: OverviewTopGeoProps) {
  const { t } = useTranslation();
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
  const [searchQuery, setSearchQuery] = useState('');
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const [widget, setWidget, widgets] = useOverviewWidgetV2('geo', {
    country: {
      title: t('overview.top_countries'),
      btn: t('overview.countries'),
    },
    region: {
      title: t('overview.top_regions'),
      btn: t('overview.regions'),
    },
    city: {
      title: t('overview.top_cities'),
      btn: t('overview.cities'),
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
    }),
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
      },
    ),
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
          searchPlaceholder={t('overview.search_column', {
            column: widget.btn.toLowerCase(),
          })}
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
              data={filteredData}
              column={{
                name: getOverviewColumnName(t, widget.key),
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
                          t('overview.not_set')}
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
            {t('overview.geo_data_provided_by')}{' '}
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
          <div className="title">{t('overview.map')}</div>
        </WidgetHead>
        <WidgetBody>
          <OverviewMap projectId={projectId} shareId={shareId} />
        </WidgetBody>
      </Widget>
    </>
  );
}
