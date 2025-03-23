'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { NOT_SET_VALUE } from '@openpanel/constants';
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
import { useOverviewWidgetV2 } from './useOverviewWidget';

interface OverviewTopSourcesProps {
  projectId: string;
}
export default function OverviewTopSources({
  projectId,
}: OverviewTopSourcesProps) {
  const { interval, range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const [widget, setWidget, widgets] = useOverviewWidgetV2('sources', {
    referrer_name: {
      title: 'Top sources',
      btn: 'All',
    },
    referrer: {
      title: 'Top urls',
      btn: 'URLs',
    },
    referrer_type: {
      title: 'Top types',
      btn: 'Types',
    },
    utm_source: {
      title: 'UTM Source',
      btn: 'Source',
    },
    utm_medium: {
      title: 'UTM Medium',
      btn: 'Medium',
    },
    utm_campaign: {
      title: 'UTM Campaign',
      btn: 'Campaign',
    },
    utm_term: {
      title: 'UTM Term',
      btn: 'Term',
    },
    utm_content: {
      title: 'UTM Content',
      btn: 'Content',
    },
  });

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
                        {(item.name || 'Direct / Not set')
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
          {/* <OverviewChartToggle {...{ chartType, setChartType }} /> */}
        </WidgetFooter>
      </Widget>
    </>
  );
}
