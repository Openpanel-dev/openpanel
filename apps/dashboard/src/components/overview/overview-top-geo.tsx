'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { useState } from 'react';

import type { IChartType } from '@openpanel/validation';

import { useNumber } from '@/hooks/useNumerFormatter';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { NOT_SET_VALUE } from '@openpanel/constants';
import { ChevronRightIcon } from 'lucide-react';
import { ReportChart } from '../report-chart';
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

interface OverviewTopGeoProps {
  projectId: string;
}
export default function OverviewTopGeo({ projectId }: OverviewTopGeoProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
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
                            <span>{item.prefix}</span>
                            <span>
                              <ChevronRightIcon className="size-3" />
                            </span>
                          </span>
                        )}
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
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">Map</div>
        </WidgetHead>
        <WidgetBody>
          <ReportChart
            options={{ hideID: true }}
            report={{
              projectId,
              startDate,
              endDate,
              events: [
                {
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
              lineType: 'monotone',
              interval: interval,
              name: 'Top sources',
              range: range,
              previous: previous,
              metric: 'sum',
            }}
          />
        </WidgetBody>
      </Widget>
    </>
  );
}
