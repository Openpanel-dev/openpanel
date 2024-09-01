import { useTransition } from 'react';
import { parseAsInteger, useQueryState } from 'nuqs';

import { useDebounceValue } from './useDebounceValue';

export function useCursor() {
  const [loading, startTransition] = useTransition();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger
      .withOptions({ shallow: false, history: 'push', startTransition })
      .withDefault(0)
  );
  return {
    cursor,
    setCursor,
    loading,
  };
}

export type UseDebouncedCursor = ReturnType<typeof useDebouncedCursor>;

export function useDebouncedCursor() {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0)
  );
  const debouncedCursor = useDebounceValue(cursor, 200);
  return {
    value: cursor,
    set: setCursor,
    debounced: debouncedCursor,
  };
}
