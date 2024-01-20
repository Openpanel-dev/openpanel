'use client';

import { useMemo } from 'react';
import { api } from '@/app/_trpc/client';
import { StickyBelowHeader } from '@/app/(app)/layout-sticky-below-header';
import { Pagination, usePagination } from '@/components/Pagination';
import { Input } from '@/components/ui/input';
import { useQueryState } from 'nuqs';

import { ProfileListItem } from './profile-list-item';

interface ListProfilesProps {
  projectId: string;
  organizationId: string;
}
export function ListProfiles({ organizationId, projectId }: ListProfilesProps) {
  const [query, setQuery] = useQueryState('q');
  const pagination = usePagination();
  const eventsQuery = api.profile.list.useQuery(
    {
      projectId,
      query,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const profiles = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  return (
    <>
      <StickyBelowHeader className="p-4 flex justify-between">
        <Input
          placeholder="Search by name"
          value={query ?? ''}
          onChange={(event) => setQuery(event.target.value || null)}
        />
      </StickyBelowHeader>
      <div className="p-4">
        <div className="flex flex-col gap-4">
          {profiles.map((item) => (
            <ProfileListItem key={item.id} {...item} />
          ))}
        </div>
        <div className="mt-2">
          <Pagination {...pagination} />
        </div>
      </div>
    </>
  );
}
