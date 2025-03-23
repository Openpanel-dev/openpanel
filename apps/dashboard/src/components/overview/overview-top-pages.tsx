'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { Globe2Icon } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useState } from 'react';

import type { IChartType } from '@openpanel/validation';

import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { Button } from '../ui/button';
import { Widget, WidgetBody } from '../widget';
import OverviewDetailsButton from './overview-details-button';
import { WidgetButtons, WidgetFooter, WidgetHead } from './overview-widget';
import {
  OverviewWidgetTableBots,
  OverviewWidgetTableLoading,
  OverviewWidgetTablePages,
} from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidgetV2 } from './useOverviewWidget';

interface OverviewTopPagesProps {
  projectId: string;
}

export default function OverviewTopPages({ projectId }: OverviewTopPagesProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [domain, setDomain] = useQueryState('d', parseAsBoolean);
  const [widget, setWidget, widgets] = useOverviewWidgetV2('pages', {
    page: {
      title: 'Top pages',
      btn: 'Top pages',
      meta: {
        columns: {
          sessions: 'Sessions',
        },
      },
    },
    entry: {
      title: 'Entry Pages',
      btn: 'Entries',
      meta: {
        columns: {
          sessions: 'Entries',
        },
      },
    },
    exit: {
      title: 'Exit Pages',
      btn: 'Exits',
      meta: {
        columns: {
          sessions: 'Exits',
        },
      },
    },
    // bot: {
    //   title: 'Bots',
    //   btn: 'Bots',
    // },
  });

  const query = api.overview.topPages.useQuery({
    projectId,
    filters,
    startDate,
    endDate,
    mode: widget.key,
    range,
    interval,
  });

  const data = query.data;

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
            <>
              {/*<OverviewWidgetTableBots data={data ?? []} />*/}
              <OverviewWidgetTablePages
                data={data ?? []}
                lastColumnName={widget.meta.columns.sessions}
                showDomain={!!domain}
              />
            </>
          )}
        </WidgetBody>
        <WidgetFooter>
          <OverviewDetailsButton
            onClick={() => pushModal('OverviewTopPagesModal', { projectId })}
          />
          {/* <OverviewChartToggle {...{ chartType, setChartType }} /> */}
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
      </Widget>
    </>
  );
}
