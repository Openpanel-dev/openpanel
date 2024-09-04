'use client';

import { TableButtons } from '@/components/data-table';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/table';
import { useDebounceValue } from '@/hooks/useDebounceValue';
import { api } from '@/trpc/client';
import { Loader2Icon } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';

import { PagesTable } from './pages-table';

export function Pages({ projectId }: { projectId: string }) {
  const take = 20;
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0)
  );
  const [search, setSearch] = useQueryState('search', {
    defaultValue: '',
    shallow: true,
  });
  const debouncedSearch = useDebounceValue(search, 500);
  const query = api.event.pages.useQuery(
    {
      projectId,
      cursor,
      take,
      search: debouncedSearch,
    },
    {
      keepPreviousData: true,
    }
  );
  const data = query.data ?? [];

  return (
    <>
      <TableButtons>
        <Input
          placeholder="Serch path"
          value={search ?? ''}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(0);
          }}
        />
      </TableButtons>
      {query.isLoading ? (
        <TableSkeleton cols={3} />
      ) : (
        <PagesTable data={data} />
      )}
      <Pagination
        className="mt-2"
        setCursor={setCursor}
        cursor={cursor}
        count={Infinity}
        take={take}
        loading={query.isFetching}
      />
    </>
  );
}
