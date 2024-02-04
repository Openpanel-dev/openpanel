'use client';

import { OverviewFilters } from '@/components/overview/overview-filters';
import { OverviewFiltersButtons } from '@/components/overview/overview-filters-buttons';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import { WidgetHead } from '@/components/overview/overview-widget';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Chart } from '@/components/report/chart';
import { ReportRange } from '@/components/report/ReportRange';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Widget, WidgetBody } from '@/components/Widget';
import type { IChartInput } from '@/types';
import { cn } from '@/utils/cn';
import { Eye, FilterIcon, Globe2Icon, LockIcon, X } from 'lucide-react';
import Link from 'next/link';

import { StickyBelowHeader } from '../../layout-sticky-below-header';

export default function OverviewMetrics() {
  const { previous, range, setRange, interval, metric, setMetric, filters } =
    useOverviewOptions();

  const reports = [
    {
      id: 'Unique visitors',
      projectId: '', // TODO: Remove
      events: [
        {
          segment: 'user',
          filters,
          id: 'A',
          name: 'session_start',
          displayName: 'Unique visitors',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Unique visitors',
      range,
      previous,
      metric: 'sum',
    },
    {
      id: 'Total sessions',
      projectId: '', // TODO: Remove
      events: [
        {
          segment: 'event',
          filters,
          id: 'A',
          name: 'session_start',
          displayName: 'Total sessions',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Total sessions',
      range,
      previous,
      metric: 'sum',
    },
    {
      id: 'Total pageviews',
      projectId: '', // TODO: Remove
      events: [
        {
          segment: 'event',
          filters,
          id: 'A',
          name: 'screen_view',
          displayName: 'Total pageviews',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Total pageviews',
      range,
      previous,
      metric: 'sum',
    },
    {
      id: 'Views per session',
      projectId: '', // TODO: Remove
      events: [
        {
          segment: 'user_average',
          filters,
          id: 'A',
          name: 'screen_view',
          displayName: 'Views per session',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Views per session',
      range,
      previous,
      metric: 'average',
    },
    {
      id: 'Bounce rate',
      projectId: '', // TODO: Remove
      events: [
        {
          segment: 'event',
          filters: [
            {
              id: '1',
              name: 'properties._bounce',
              operator: 'is',
              value: ['true'],
            },
            ...filters,
          ],
          id: 'A',
          name: 'session_end',
          displayName: 'Bounce rate',
        },
        {
          segment: 'event',
          filters: filters,
          id: 'B',
          name: 'session_end',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Bounce rate',
      range,
      previous,
      previousIndicatorInverted: true,
      formula: 'A/B*100',
      metric: 'average',
      unit: '%',
    },
    {
      id: 'Visit duration',
      projectId: '', // TODO: Remove
      events: [
        {
          segment: 'property_average',
          filters: [
            {
              name: 'duration',
              operator: 'isNot',
              value: ['0'],
              id: 'A',
            },
            ...filters,
          ],
          id: 'A',
          property: 'duration',
          name: 'screen_view',
          displayName: 'Visit duration',
        },
      ],
      breakdowns: [],
      chartType: 'metric',
      lineType: 'monotone',
      interval,
      name: 'Visit duration',
      range,
      previous,
      formula: 'A/1000/60',
      metric: 'average',
      unit: 'min',
    },
  ] satisfies (IChartInput & { id: string })[];

  const selectedMetric = reports[metric]!;

  return (
    <Sheet>
      <StickyBelowHeader className="p-4 flex gap-2 justify-between">
        <ReportRange
          size="sm"
          value={range}
          onChange={(value) => setRange(value)}
        />
        <div className="flex-wrap flex gap-2">
          <OverviewFiltersButtons />
          <SheetTrigger asChild>
            <Button size="sm" variant="cta" icon={FilterIcon}>
              Filters
            </Button>
          </SheetTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" icon={Globe2Icon}>
                Public
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="http://localhost:3000/share/project/4e2798cb-e255-4e9d-960d-c9ad095aabd7">
                    <Eye size={16} className="mr-2" />
                    View
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(event) => {}}>
                  <LockIcon size={16} className="mr-2" />
                  Make private
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </StickyBelowHeader>
      <div className="p-4 grid gap-4 grid-cols-6">
        {reports.map((report, index) => (
          <button
            key={index}
            className="relative col-span-6 md:col-span-3 lg:col-span-2 group"
            onClick={() => {
              setMetric(index);
            }}
          >
            <Chart hideID {...report} />

            {/* add active border */}
            <div
              className={cn(
                'transition-opacity top-0 left-0 right-0 bottom-0 absolute rounded-md w-full h-full border ring-1 border-chart-0 ring-chart-0',
                metric === index ? 'opacity-100' : 'opacity-0'
              )}
            />
          </button>
        ))}
        <Widget className="col-span-6">
          <WidgetHead>
            <div className="title">{selectedMetric.events[0]?.displayName}</div>
          </WidgetHead>
          <WidgetBody>
            <Chart hideID {...selectedMetric} chartType="linear" />
          </WidgetBody>
        </Widget>
        <OverviewTopSources />
        <OverviewTopPages />
        <OverviewTopDevices />
        <OverviewTopGeo />
        <OverviewTopEvents />
      </div>

      <SheetContent className="!max-w-lg w-full" side="left">
        <OverviewFilters />
      </SheetContent>
    </Sheet>
  );
}
