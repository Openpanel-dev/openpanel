'use client';

import { TableButtons } from '@/components/data-table';
import { EventsTable } from '@/components/events/table';
import { EventsTableColumns } from '@/components/events/table/events-table-columns';
import { api } from '@/trpc/client';
import { Loader2Icon } from 'lucide-react';

type Props = {
  projectId: string;
  profileId?: string;
};

const Conversions = ({ projectId }: Props) => {
  const query = api.event.conversions.useInfiniteQuery(
    {
      projectId,
    },
    {
      getNextPageParam: (lastPage) => lastPage.meta.next,
      keepPreviousData: true,
    },
  );

  return (
    <div>
      <TableButtons>
        <EventsTableColumns />
        {query.isRefetching && (
          <div className="center-center size-8 rounded border bg-background">
            <Loader2Icon
              size={12}
              className="size-4 shrink-0 animate-spin text-black text-highlight"
            />
          </div>
        )}
      </TableButtons>
      <EventsTable query={query} />
    </div>
  );
};

export default Conversions;
