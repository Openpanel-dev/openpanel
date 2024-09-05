import { useCallback } from 'react';
import type { Options as NuqsOptions } from 'nuqs';
import {
  createParser,
  parseAsArrayOf,
  parseAsString,
  useQueryState,
} from 'nuqs';

import type { IChartEventFilterOperator } from '@openpanel/validation';

const nuqsOptions = { history: 'push' } as const;

export const eventQueryFiltersParser = createParser({
  parse: (query: string) => {
    if (query === '') return [];
    const filters = query.split(';');

    return (
      filters.map((filter) => {
        const [key, operator, value] = filter.split(',');
        return {
          id: key!,
          name: key!,
          operator: (operator ?? 'is') as IChartEventFilterOperator,
          value: value
            ? value.split('|').map((v) => decodeURIComponent(v))
            : [],
        };
      }) ?? []
    );
  },
  serialize: (value) => {
    return value
      .map(
        (filter) =>
          `${filter.id},${filter.operator},${filter.value.map((v) => encodeURIComponent(v.trim())).join('|')}`
      )
      .join(';');
  },
});

export function useEventQueryFilters(options: NuqsOptions = {}) {
  const [filters, setFilters] = useQueryState(
    'f',
    eventQueryFiltersParser.withDefault([]).withOptions({
      ...nuqsOptions,
      ...options,
    })
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
      operator: IChartEventFilterOperator = 'is'
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
                operator,
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
            operator,
            value: newValue,
          },
        ];
      });
    },
    [setFilters]
  );

  return [filters, setFilter, setFilters] as const;
}

export const eventQueryNamesFilter = parseAsArrayOf(parseAsString).withDefault(
  []
);

export function useEventQueryNamesFilter(options: NuqsOptions = {}) {
  return useQueryState('events', eventQueryNamesFilter.withOptions(options));
}
