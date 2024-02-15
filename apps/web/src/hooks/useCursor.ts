import { parseAsIsoDateTime, useQueryState } from 'nuqs';

export function useCursor() {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsIsoDateTime.withOptions({ shallow: false })
  );
  return {
    cursor,
    setCursor,
  };
}
