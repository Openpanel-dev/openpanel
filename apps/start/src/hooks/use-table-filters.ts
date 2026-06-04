import type { Options as NuqsOptions } from 'nuqs';
import { useQueryState } from 'nuqs';
import { useCallback, useMemo } from 'react';

import type { IChartEventFilter } from '@openpanel/validation';

import { eventQueryFiltersParser } from './use-event-query-filters';

const nuqsOptions = { history: 'push' } as const;

/**
 * Generic table-filter state hook. Stores an `IChartEventFilter[]` in the URL
 * using the same encoding as `useEventQueryFilters`, but parameterised by key
 * so multiple tables can persist independent filter sets in one URL.
 */
export function useTableFilters(
  key = 'f',
  options: NuqsOptions = {},
): [
  IChartEventFilter[],
  (next: IChartEventFilter[]) => void,
] {
  const [rawFilters, setFilters] = useQueryState(
    key,
    eventQueryFiltersParser.withDefault([]).withOptions({
      ...nuqsOptions,
      ...options,
    }),
  );

  const filters = useMemo<IChartEventFilter[]>(
    () => rawFilters as unknown as IChartEventFilter[],
    [rawFilters],
  );

  const setAll = useCallback(
    (next: IChartEventFilter[]) => {
      setFilters(
        next.map((filter) => ({
          id: filter.id ?? filter.name,
          name: filter.name,
          operator: filter.operator,
          value: filter.value.map((v) => (v == null ? '' : String(v))),
          // Preserve both cohort fields so legacy consumers reading
          // `cohortId` directly stay happy while the parser round-trips
          // `cohortIds` as the source of truth.
          ...(filter.cohortIds && filter.cohortIds.length > 0
            ? { cohortIds: filter.cohortIds }
            : {}),
          ...(filter.cohortId ? { cohortId: filter.cohortId } : {}),
        })),
      );
    },
    [setFilters],
  );

  return [filters, setAll];
}
