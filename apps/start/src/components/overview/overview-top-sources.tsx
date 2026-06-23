import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { NOT_SET_VALUE } from '@openpanel/constants';
import { useQuery } from '@tanstack/react-query';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Widget, WidgetBody } from '../widget';
import { getOverviewColumnNameKey } from './overview-constants';
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
import { useOverviewWidgetV2 } from './useOverviewWidget';

interface OverviewTopSourcesProps {
  projectId: string;
  shareId?: string;
}
export default function OverviewTopSources({
  projectId,
  shareId,
}: OverviewTopSourcesProps) {
  const { t } = useTranslation();
  const { interval, range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const [searchQuery, setSearchQuery] = useState('');
  const [view] = useOverviewView();
  const [widget, setWidget, widgets] = useOverviewWidgetV2('sources', {
    referrer_name: {
      title: t('overview.top_sources'),
      btn: t('overview.refs'),
    },
    referrer: {
      title: t('overview.top_urls'),
      btn: t('overview.urls'),
    },
    referrer_type: {
      title: t('overview.top_types'),
      btn: t('overview.types'),
    },
    utm_source: {
      title: t('overview.utm_source'),
      btn: t('overview.source'),
    },
    utm_medium: {
      title: t('overview.utm_medium'),
      btn: t('overview.medium'),
    },
    utm_campaign: {
      title: t('overview.utm_campaign'),
      btn: t('overview.campaign'),
    },
    utm_term: {
      title: t('overview.utm_term'),
      btn: t('overview.term'),
    },
    utm_content: {
      title: t('overview.utm_content'),
      btn: t('overview.content'),
    },
  });
  const trpc = useTRPC();

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
                name: t(getOverviewColumnNameKey(widget.key)),
                render(item) {
                  return (
                    <div className="row items-center gap-2 min-w-0 relative">
                      <SerieIcon name={item.name || NOT_SET_VALUE} />
                      <button
                        type="button"
                        className="truncate"
                        onClick={() => {
                          if (widget.key.startsWith('utm_')) {
                            setFilter(
                              `properties.__query.${widget.key}`,
                              item.name,
                            );
                          } else {
                            setFilter(widget.key, item.name);
                          }
                        }}
                      >
                        {(item.name || t('overview.direct_not_set'))
                          .replace(/https?:\/\//, '')
                          .replace('www.', '')}
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
