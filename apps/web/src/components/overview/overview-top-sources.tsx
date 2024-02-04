'use client';

import { Chart } from '@/components/report/chart';
import type { IChartInput } from '@/types';
import { cn } from '@/utils/cn';

import { Widget, WidgetBody } from '../Widget';
import { WidgetButtons, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

export default function OverviewTopSources() {
  const {
    filters,
    interval,
    range,
    previous,
    setReferrer,
    setUtmSource,
    setUtmMedium,
    setUtmCampaign,
    setUtmTerm,
    setUtmContent,
  } = useOverviewOptions();
  const [widget, setWidget, widgets] = useOverviewWidget('sources', {
    all: {
      title: 'Top sources',
      btn: 'All',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'event',
            filters: filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'referrer',
          },
        ],
        chartType: 'bar',
        lineType: 'monotone',
        interval: interval,
        name: 'Top sources',
        range: range,
        previous: previous,
        metric: 'sum',
      },
    },
    utm_source: {
      title: 'UTM Source',
      btn: 'Source',
      chart: {
        projectId: '',
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'properties.query.utm_source',
          },
        ],
        chartType: 'bar',
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
        projectId: '',
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'properties.query.utm_medium',
          },
        ],
        chartType: 'bar',
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
        projectId: '',
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'properties.query.utm_campaign',
          },
        ],
        chartType: 'bar',
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
        projectId: '',
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'properties.query.utm_term',
          },
        ],
        chartType: 'bar',
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
        projectId: '',
        events: [
          {
            segment: 'event',
            filters,
            id: 'A',
            name: 'session_start',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'properties.query.utm_content',
          },
        ],
        chartType: 'bar',
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
        <WidgetHead className="flex items-center justify-between">
          <div className="title">{widget.title}</div>
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
          <Chart
            hideID
            {...widget.chart}
            previous={false}
            onClick={(item) => {
              switch (widget.key) {
                case 'all':
                  setReferrer(item.name);
                  break;
                case 'utm_source':
                  setUtmSource(item.name);
                  break;
                case 'utm_medium':
                  setUtmMedium(item.name);
                  break;
                case 'utm_campaign':
                  setUtmCampaign(item.name);
                  break;
                case 'utm_term':
                  setUtmTerm(item.name);
                  break;
                case 'utm_content':
                  setUtmContent(item.name);
                  break;
              }
            }}
          />
        </WidgetBody>
      </Widget>
    </>
  );
}
