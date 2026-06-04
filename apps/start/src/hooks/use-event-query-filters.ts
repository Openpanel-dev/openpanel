import type { Options as NuqsOptions } from 'nuqs';
import {
  createParser,
  parseAsArrayOf,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useCallback } from 'react';

import type { IChartEventFilterOperator } from '@openpanel/validation';

const nuqsOptions = { history: 'push' } as const;

export const eventQueryFiltersParser = createParser({
  parse: (query: string) => {
    if (query === '') return [];
    const filters = query.split(';');

    return filters.map((filter) => {
      const [key, operator, value, cohortIdSegment] = filter.split(',');
      const name = key ?? '';
      // 4th segment is pipe-separated cohort ids. Old single-id URLs split
      // to a one-element array; new URLs may carry many.
      const cohortIds = cohortIdSegment
        ? cohortIdSegment
            .split('|')
            .map((v) => decodeURIComponent(v))
            .filter(Boolean)
        : name.startsWith('cohort:')
          ? [name.slice('cohort:'.length)]
          : [];
      return {
        id: name,
        name,
        operator: (operator ?? 'is') as IChartEventFilterOperator,
        value: value
          ? value.split('|').map((v) => decodeURIComponent(v))
          : [],
        // Keep both fields populated for legacy consumers that read
        // `cohortId` directly. `cohortIds` is the source of truth.
        ...(cohortIds.length > 0
          ? { cohortId: cohortIds[0], cohortIds }
          : {}),
      };
    });
  },
  serialize: (value) => {
    return value
      .map((filter) => {
        const encodedValue = filter.value
          .map((v) => encodeURIComponent(String(v).trim()))
          .join('|');
        // Prefer the multi-value `cohortIds`. Fall back to the legacy
        // singular `cohortId` so already-rendered filters without the new
        // field still round-trip.
        const cohortIds =
          filter.cohortIds && filter.cohortIds.length > 0
            ? filter.cohortIds
            : filter.cohortId
              ? [filter.cohortId]
              : [];
        const cohortSegment =
          cohortIds.length > 0
            ? `,${cohortIds.map((c) => encodeURIComponent(c)).join('|')}`
            : '';
        // Always serialize by `name` — `id` may be a random shortId used only
        // for React reconciliation and would otherwise clobber the human
        // label on the next page load.
        return `${filter.name},${filter.operator},${encodedValue}${cohortSegment}`;
      })
      .join(';');
  },
});

export function useEventQueryFilters(options: NuqsOptions = {}) {
  const [filters, setFilters] = useQueryState(
    'f',
    eventQueryFiltersParser.withDefault([]).withOptions({
      ...nuqsOptions,
      ...options,
    }),
  );

  const setFilter = useCallback(
    (
      name: string,
      value:
        | string
        | number
        | boolean
        | undefined
        | null
        | (string | number | boolean | undefined | null)[],
      operator?: IChartEventFilterOperator,
    ) => {
      setFilters((prev) => {
        const exists = prev.find((filter) => filter.name === name);
        const arrValue = Array.isArray(value) ? value : [value];
        const newValue = value ? arrValue.map(String) : [];

        // If nothing changes remove it
        if (
          newValue.length === 0 &&
          exists?.value.length === 0 &&
          exists.operator === operator
        ) {
          return prev.filter((filter) => filter.name !== name);
        }

        if (exists) {
          return prev.map((filter) => {
            if (filter.name === name) {
              return {
                ...filter,
                operator:
                  !operator && newValue.length === 0
                    ? 'isNull'
                    : (operator ?? 'is'),
                value: newValue,
              };
            }
            return filter;
          });
        }

        return [
          ...prev,
          {
            id: name,
            name,
            operator:
              !operator && newValue.length === 0
                ? 'isNull'
                : (operator ?? 'is'),
            value: newValue,
          },
        ];
      });
    },
    [setFilters],
  );

  const removeFilter = useCallback(
    (name: string) => {
      setFilters((prev) => prev.filter((filter) => filter.name !== name));
    },
    [setFilters],
  );

  return [filters, setFilter, setFilters, removeFilter] as const;
}

export const eventQueryNamesFilter = parseAsArrayOf(parseAsString).withDefault(
  [],
);

export function useEventQueryNamesFilter(options: NuqsOptions = {}) {
  return useQueryState('events', eventQueryNamesFilter.withOptions(options));
}
