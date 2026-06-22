import { useEventQueryFilters } from '@/hooks/use-event-query-filters';

import { useTRPC } from '@/integrations/trpc/react';
import type { IGetTopGenericInput } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SerieIcon } from '../report-chart/common/serie-icon';
import {
  getOverviewColumnNameKey,
  getOverviewColumnNamePluralKey,
} from './overview-constants';
import { OverviewListModal } from './overview-list-modal';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewTopGenericModalProps {
  projectId: string;
  column: IGetTopGenericInput['column'];
}

export default function OverviewTopGenericModal({
  projectId,
  column,
}: OverviewTopGenericModalProps) {
  const { t } = useTranslation();
  const [_filters, setFilter] = useEventQueryFilters();
  const { startDate, endDate, range } = useOverviewOptions();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.overview.topGeneric.queryOptions({
      projectId,
      filters: _filters,
      startDate,
      endDate,
      range,
      column,
    }),
  );

  const columnNamePlural = t(getOverviewColumnNamePluralKey(column));
  const columnName = t(getOverviewColumnNameKey(column));

  return (
    <OverviewListModal
      title={t('overview.top_column', { column: columnNamePlural })}
      searchPlaceholder={t('overview.search_column', {
        column: columnNamePlural.toLowerCase(),
      })}
      data={query.data ?? []}
      keyExtractor={(item) => (item.prefix ?? '') + item.name}
      searchFilter={(item, query) =>
        item.name?.toLowerCase().includes(query) ||
        item.prefix?.toLowerCase().includes(query) ||
        false
      }
      columnName={columnName}
      renderItem={(item) => (
        <div className="flex items-center gap-2 min-w-0">
          <SerieIcon name={item.prefix || item.name} />
          <button
            type="button"
            className="truncate hover:underline"
            onClick={() => {
              setFilter(column, item.name);
            }}
          >
            {item.prefix && (
              <span className="mr-1 inline-flex items-center gap-1">
                <span>{item.prefix}</span>
                <ChevronRightIcon className="size-3" />
              </span>
            )}
            {item.name || t('overview.not_set')}
          </button>
        </div>
      )}
    />
  );
}
