'use client';

import { useState } from 'react';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { ScanEyeIcon } from 'lucide-react';

import type { IChartType } from '@openpanel/validation';

import { LazyChart } from '../report/chart/LazyChart';
import { Widget, WidgetBody } from '../widget';
import { OverviewChartToggle } from './overview-chart-toggle';
import OverviewDetailsButton from './overview-details-button';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopSourcesProps {
  projectId: string;
}
export default function OverviewTopSources({
  projectId,
}: OverviewTopSourcesProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
  const isPageFilter = filters.find((filter) => filter.name === 'path');
  const [widget, setWidget, widgets] = useOverviewWidget('sources', {
    all: {
      title: 'Top sources',
      btn: 'All',
      chart: {
        limit: 10,
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: filters,
            id: 'A',
            name: isPageFilter ? 'screen_view' : 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'referrer_name',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top groups',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    domain: {
      title: 'Top urls',
      btn: 'URLs',
      chart: {
        limit: 10,
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: filters,
            id: 'A',
            name: isPageFilter ? 'screen_view' : 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'referrer',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    type: {
      title: 'Top types',
      btn: 'Types',
      chart: {
        limit: 10,
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: filters,
            id: 'A',
            name: isPageFilter ? 'screen_view' : 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'referrer_type',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top types',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    utm_source: {
      title: 'UTM Source',
      btn: 'Source',
      chart: {
        limit: 10,
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
            name: 'properties.__query.utm_source',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    utm_medium: {
      title: 'UTM Medium',
      btn: 'Medium',
      chart: {
        limit: 10,
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
            name: 'properties.__query.utm_medium',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    utm_campaign: {
      title: 'UTM Campaign',
      btn: 'Campaign',
      chart: {
        limit: 10,
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
            name: 'properties.__query.utm_campaign',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    utm_term: {
      title: 'UTM Term',
      btn: 'Term',
      chart: {
        limit: 10,
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
            name: 'properties.__query.utm_term',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    utm_content: {
      title: 'UTM Content',
      btn: 'Content',
      chart: {
        limit: 10,
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
            name: 'properties.__query.utm_content',
          },
        ],
        chartType,
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
  });

  return (
    <>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">
            {widget.title}
            <OverviewChartToggle {...{ chartType, setChartType }} />
          </div>

          <WidgetButtons>
            {widgets.map((w) => (
              <button
                key={w.key}
                onClick={() => setWidget(w.key)}
                className={cn(w.key === widget.key && 'active')}
              >
                {w.btn}
              </button>
            ))}
          </WidgetButtons>
        </WidgetHead>
        <WidgetBody>
          <LazyChart
            hideID
            {...widget.chart}
            previous={false}
            onClick={(item) => {
              switch (widget.key) {
                case 'all':
                  setFilter('referrer_name', item.name);
                  setWidget('domain');
                  break;
                case 'domain':
                  setFilter('referrer', item.name);
                  break;
                case 'type':
                  setFilter('referrer_type', item.name);
                  setWidget('domain');
                  break;
                case 'utm_source':
                  setFilter('properties.__query.utm_source', item.name);
                  break;
                case 'utm_medium':
                  setFilter('properties.__query.utm_medium', item.name);
                  break;
                case 'utm_campaign':
                  setFilter('properties.__query.utm_campaign', item.name);
                  break;
                case 'utm_term':
                  setFilter('properties.__query.utm_term', item.name);
                  break;
                case 'utm_content':
                  setFilter('properties.__query.utm_content', item.name);
                  break;
              }
            }}
          />
          <OverviewDetailsButton chart={widget.chart} />
        </WidgetBody>
      </Widget>
    </>
  );
}
