'use client';

import { useMemo } from 'react';
import { api } from '@/app/_trpc/client';
import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { Pagination, usePagination } from '@/components/Pagination';
import { Input } from '@/components/ui/input';
import { UsersIcon } from 'lucide-react';
import { useQueryState } from 'nuqs';

import { ProfileListItem } from './profile-list-item';

interface ListProfilesProps {
  projectId: string;
}
export function ListProfiles({ projectId }: ListProfilesProps) {
  const [query, setQuery] = useQueryState('q');
  const pagination = usePagination();
  const profilesQuery = api.profile.list.useQuery(
    {
      projectId,
      query,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery]);

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
        {profiles.length === 0 ? (
          <FullPageEmptyState title="No profiles" icon={UsersIcon}>
            {query ? (
              <p>
                No match for <strong>"{query}"</strong>
              </p>
            ) : (
              <p>We could not find any profiles on this project</p>
            )}
          </FullPageEmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {profiles.map((item) => (
                <ProfileListItem key={item.id} {...item} />
              ))}
            </div>
            <div className="mt-2">
              <Pagination {...pagination} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
