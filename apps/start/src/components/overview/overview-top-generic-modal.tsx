import type { IGetTopGenericInput } from '@openpanel/core';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import {
  OVERVIEW_COLUMNS_NAME,
  OVERVIEW_COLUMNS_NAME_PLURAL,
} from './overview-constants';
import { OverviewListModal } from './overview-list-modal';
import { useOverviewOptions } from './useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';

interface OverviewTopGenericModalProps {
  projectId: string;
  shareId?: string;
  column: IGetTopGenericInput['column'];
}

export default function OverviewTopGenericModal({
  projectId,
  shareId,
  column,
}: OverviewTopGenericModalProps) {
  const [_filters, setFilter] = useEventQueryFilters();
  const { startDate, endDate, range } = useOverviewOptions();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.overview.topGeneric.queryOptions({
      projectId,
      shareId,
      filters: _filters,
      startDate,
      endDate,
      range,
      column,
    })
  );

  const columnNamePlural = OVERVIEW_COLUMNS_NAME_PLURAL[column];
  const columnName = OVERVIEW_COLUMNS_NAME[column];

  return (
    <OverviewListModal
      columnName={columnName}
      data={query.data ?? []}
      keyExtractor={(item) => (item.prefix ?? '') + item.name}
      renderItem={(item) => (
        <div className="flex min-w-0 items-center gap-2">
          <SerieIcon name={item.prefix || item.name} />
          <button
            className="truncate hover:underline"
            onClick={() => {
              setFilter(column, item.name);
            }}
            type="button"
          >
            {item.prefix && (
              <span className="mr-1 inline-flex items-center gap-1">
                <span>{item.prefix}</span>
                <ChevronRightIcon className="size-3" />
              </span>
            )}
            {item.name || 'Not set'}
          </button>
        </div>
      )}
      searchFilter={(item, query) =>
        Boolean(
          item.name?.toLowerCase().includes(query) ||
            item.prefix?.toLowerCase().includes(query)
        )
      }
      searchPlaceholder={`Search ${columnNamePlural.toLowerCase()}...`}
      title={`Top ${columnNamePlural}`}
    />
  );
}
