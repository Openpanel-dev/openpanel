import { useQueryState } from 'nuqs';
import { useDebounceValue } from './useDebounceValue';

export function useSearchQueryState() {
  const [search, setSearch] = useQueryState('search', {
    defaultValue: '',
    shallow: true,
  });
  const debouncedSearch = useDebounceValue(search, 500);

  return {
    search,
    debouncedSearch,
    setSearch,
  };
}
