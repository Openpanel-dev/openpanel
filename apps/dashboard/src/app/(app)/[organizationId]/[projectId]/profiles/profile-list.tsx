'use client';

import { Suspense } from 'react';
import { FullPageEmptyState } from '@/components/FullPageEmptyState';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { useCursor } from '@/hooks/useCursor';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { UsersIcon } from 'lucide-react';

import type { IServiceProfile } from '@mixan/db';

import { ProfileListItem } from './profile-list-item';

interface ProfileListProps {
  data: IServiceProfile[];
  count: number;
}
export function ProfileList({ data, count }: ProfileListProps) {
  const { cursor, setCursor } = useCursor();
  const [filters] = useEventQueryFilters();

  return (
    <Suspense>
      <div className="p-4">
        {data.length === 0 ? (
          <FullPageEmptyState title="No profiles here" icon={UsersIcon}>
            {cursor !== 0 ? (
              <>
                <p>Looks like you have reached the end of the list</p>
                <Button
                  className="mt-4"
                  variant="outline"
                  size="sm"
                  onClick={() => setCursor((p) => Math.max(0, p - 1))}
                >
                  Go back
                </Button>
              </>
            ) : (
              <>
                {filters.length ? (
                  <p>Could not find any profiles with your filter</p>
                ) : (
                  <p>No profiles have been created yet</p>
                )}
              </>
            )}
          </FullPageEmptyState>
        ) : (
          <>
            <Pagination
              cursor={cursor}
              setCursor={setCursor}
              count={count}
              take={50}
            />
            <div className="flex flex-col gap-4 my-4">
              {data.map((item) => (
                <ProfileListItem key={item.id} {...item} />
              ))}
            </div>
            <Pagination
              cursor={cursor}
              setCursor={setCursor}
              count={count}
              take={50}
            />
          </>
        )}
      </div>
    </Suspense>
  );
}
