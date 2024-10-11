'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { ExternalLinkIcon, FilterIcon, Globe2Icon } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useState } from 'react';

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartType } from '@openpanel/validation';

import { ReportChart } from '../report-chart';
import { Button } from '../ui/button';
import { Tooltiper } from '../ui/tooltip';
import { Widget, WidgetBody } from '../widget';
import { OverviewChartToggle } from './overview-chart-toggle';
import OverviewDetailsButton from './overview-details-button';
import OverviewTopBots from './overview-top-bots';
import { WidgetButtons, WidgetFooter, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidget } from './useOverviewWidget';

interface OverviewTopPagesProps {
  projectId: string;
}
export default function OverviewTopPages({ projectId }: OverviewTopPagesProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [chartType, setChartType] = useState<IChartType>('bar');
  const [filters, setFilter] = useEventQueryFilters();
  const [domain, setDomain] = useQueryState('d', parseAsBoolean);
  const renderSerieName = (names: string[]) => {
    if (domain) {
      if (names[0] === NOT_SET_VALUE) {
        return names[1];
      }

      return names.join('');
    }
    return (
      <Tooltiper content={names.join('')} side="left" className="text-left">
        {names[1] || NOT_SET_VALUE}
      </Tooltiper>
    );
  };
  const [widget, setWidget, widgets] = useOverviewWidget('pages', {
    top: {
      title: 'Top pages',
      btn: 'Top pages',
      chart: {
        options: {
          renderSerieName,
        },
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'event',
              filters,
              id: 'A',
              name: 'screen_view',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'origin',
            },
            {
              id: 'B',
              name: 'path',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval,
          name: 'Top pages',
          range,
          previous,
          metric: 'sum',
        },
      },
    },
    entries: {
      title: 'Entry Pages',
      btn: 'Entries',
      chart: {
        options: {
          renderSerieName,
        },
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
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
              name: 'origin',
            },
            {
              id: 'B',
              name: 'path',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval,
          name: 'Entry Pages',
          range,
          previous,
          metric: 'sum',
        },
      },
    },
    exits: {
      title: 'Exit Pages',
      btn: 'Exits',
      chart: {
        options: {
          renderSerieName,
        },
        report: {
          limit: 10,
          projectId,
          startDate,
          endDate,
          events: [
            {
              segment: 'event',
              filters,
              id: 'A',
              name: 'session_end',
            },
          ],
          breakdowns: [
            {
              id: 'A',
              name: 'origin',
            },
            {
              id: 'B',
              name: 'path',
            },
          ],
          chartType,
          lineType: 'monotone',
          interval,
          name: 'Exit Pages',
          range,
          previous,
          metric: 'sum',
        },
      },
    },
    bot: {
      title: 'Bots',
      btn: 'Bots',
      // @ts-expect-error
      chart: null,
    },
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
        <WidgetBody>
          {widget.key === 'bot' ? (
            <OverviewTopBots projectId={projectId} />
          ) : (
            <ReportChart
              options={{
                hideID: true,
                dropdownMenuContent: (serie) => [
                  {
                    title: 'Visit page',
                    icon: ExternalLinkIcon,
                    onClick: () => {
                      window.open(serie.names.join(''), '_blank');
                    },
                  },
                  {
                    title: 'Set filter',
                    icon: FilterIcon,
                    onClick: () => {
                      setFilter('path', serie.names[1]);
                    },
                  },
                ],
                ...widget.chart.options,
              }}
              report={{
                ...widget.chart.report,
                previous: false,
              }}
            />
          )}
        </WidgetBody>
        {widget.chart?.report?.name && (
          <WidgetFooter>
            <OverviewDetailsButton chart={widget.chart.report} />
            <OverviewChartToggle {...{ chartType, setChartType }} />
            <div className="flex-1" />
            <Button
              variant={'ghost'}
              onClick={() => {
                setDomain((p) => !p);
              }}
              icon={Globe2Icon}
            >
              {domain ? 'Hide domain' : 'Show domain'}
            </Button>
          </WidgetFooter>
        )}
      </Widget>
    </>
  );
}
