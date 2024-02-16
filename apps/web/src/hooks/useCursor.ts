import { parseAsInteger, useQueryState } from 'nuqs';

export function useCursor() {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger
      .withOptions({ shallow: false, history: 'push' })
      .withDefault(0)
  );
  return {
    cursor,
    setCursor,
  };
}
