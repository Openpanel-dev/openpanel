import { useTransition } from 'react';
import { parseAsInteger, useQueryState } from 'nuqs';

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
