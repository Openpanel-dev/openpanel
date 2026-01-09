import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { Globe2Icon } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';

import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Widget, WidgetBody } from '../widget';
import OverviewDetailsButton from './overview-details-button';
import { WidgetFooter, WidgetHeadSearchable } from './overview-widget';
import {
  OverviewWidgetTableEntries,
  OverviewWidgetTableLoading,
  OverviewWidgetTablePages,
} from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';
import { useOverviewWidgetV2 } from './useOverviewWidget';

interface OverviewTopPagesProps {
  projectId: string;
}

export default function OverviewTopPages({ projectId }: OverviewTopPagesProps) {
  const { interval, range, startDate, endDate } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [domain, setDomain] = useQueryState('d', parseAsBoolean);
  const [searchQuery, setSearchQuery] = useState('');
  const [widget, setWidget, widgets] = useOverviewWidgetV2('pages', {
    page: {
      title: 'Top pages',
      btn: 'Pages',
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
  });
  const trpc = useTRPC();

  const query = useQuery(
    trpc.overview.topPages.queryOptions({
      projectId,
      filters,
      startDate,
      endDate,
      mode: widget.key,
      range,
    }),
  );

  const filteredData = useMemo(() => {
    const data = query.data?.slice(0, 15) ?? [];
    if (!searchQuery.trim()) {
      return data;
    }
    const queryLower = searchQuery.toLowerCase();
    return data.filter(
      (item) =>
        item.path.toLowerCase().includes(queryLower) ||
        item.origin.toLowerCase().includes(queryLower),
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
          {query.isLoading ? (
            <OverviewWidgetTableLoading />
          ) : (
            <>
              {widget.meta?.columns.sessions ? (
                <OverviewWidgetTableEntries
                  data={filteredData}
                  lastColumnName={widget.meta.columns.sessions}
                  showDomain={!!domain}
                />
              ) : (
                <OverviewWidgetTablePages
                  data={filteredData}
                  showDomain={!!domain}
                />
              )}
            </>
          )}
        </WidgetBody>
        <WidgetFooter>
          <OverviewDetailsButton
            onClick={() => pushModal('OverviewTopPagesModal', { projectId })}
          />
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
