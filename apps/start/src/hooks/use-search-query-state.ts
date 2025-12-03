import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import { useQueryState } from 'nuqs';
import { useDebounceValue } from './use-debounce-value';

export function useSearchQueryState(props?: {
  searchKey?: string;
  debounceMs?: number;
}) {
  const searchKey = props?.searchKey ?? 'search';
  const debounceMs = props?.debounceMs ?? 500;
  const { page, setPage } = useDataTablePagination();
  const [search, setSearch] = useQueryState(searchKey, {
    defaultValue: '',
    clearOnDefault: true,
    limitUrlUpdates: {
      method: 'debounce',
      timeMs: debounceMs,
    },
  });
  const debouncedSearch = useDebounceValue(search, debounceMs);

  return {
    search,
    debouncedSearch,
    setSearch: (value: string) => {
      if (page !== 1) {
        void setPage(1);
      }
      setSearch(value);
    },
  };
}
