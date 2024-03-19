import { useCallback } from 'react';

// prettier-ignore
import type { Options as NuqsOptions } from 'nuqs';

import {
  createParser,
  parseAsArrayOf,
  parseAsString,
  useQueryState,
} from 'nuqs';

const nuqsOptions = { history: 'push' } as const;

type Operator = 'is' | 'isNot' | 'contains' | 'doesNotContain';

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
          operator: (operator ?? 'is') as Operator,
          value: [decodeURIComponent(value!)],
        };
      }) ?? []
    );
  },
  serialize: (value) => {
    return value
      .map(
        (filter) =>
          `${filter.id},${filter.operator},${encodeURIComponent(filter.value[0] ?? '')}`
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
      value: string | number | boolean | undefined | null,
      operator: Operator = 'is'
    ) => {
      setFilters((prev) => {
        const exists = prev.find((filter) => filter.name === name);
        if (exists) {
          // If same value is already set, remove the filter
          if (exists.value[0] === value) {
            return prev.filter((filter) => filter.name !== name);
          }

          return prev.map((filter) => {
            if (filter.name === name) {
              return {
                ...filter,
                operator,
                value: [String(value)],
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
            value: [String(value)],
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
