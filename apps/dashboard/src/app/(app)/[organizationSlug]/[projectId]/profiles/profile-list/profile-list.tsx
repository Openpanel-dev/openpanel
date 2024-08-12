'use client';

import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Pagination } from '@/components/pagination';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { Button } from '@/components/ui/button';
import { Tooltiper } from '@/components/ui/tooltip';
import { Widget, WidgetHead } from '@/components/widget';
import { WidgetTable } from '@/components/widget-table';
import { useAppParams } from '@/hooks/useAppParams';
import { useCursor } from '@/hooks/useCursor';
import { getProfileName } from '@/utils/getters';
import { UsersIcon } from 'lucide-react';
import Link from 'next/link';

import type { IServiceProfile } from '@openpanel/db';

interface ProfileListProps {
  data: IServiceProfile[];
  count: number;
  limit?: number;
}
export function ProfileList({ data, count, limit = 50 }: ProfileListProps) {
  const { organizationSlug, projectId } = useAppParams();
  const { cursor, setCursor, loading } = useCursor();
  return (
    <Widget>
      <WidgetHead className="flex items-center justify-between">
        <div className="title">Profiles</div>
        <Pagination
          size="sm"
          cursor={cursor}
          setCursor={setCursor}
          loading={loading}
          count={count}
          take={limit}
        />
      </WidgetHead>
      {data.length ? (
        <>
          <WidgetTable
            data={data}
            keyExtractor={(item) => item.id}
            columns={[
              {
                name: 'Name',
                render(profile) {
                  return (
                    <Link
                      href={`/${organizationSlug}/${projectId}/profiles/${profile.id}`}
                      className="flex items-center gap-2 font-medium"
                      title={getProfileName(profile, false)}
                    >
                      <ProfileAvatar size="sm" {...profile} />
                      {getProfileName(profile)}
                    </Link>
                  );
                },
              },
              {
                name: '',
                render(profile) {
                  return <ListPropertiesIcon {...profile.properties} />;
                },
              },
              {
                name: 'Last seen',
                render(profile) {
                  return (
                    <Tooltiper
                      asChild
                      content={profile.createdAt.toLocaleString()}
                    >
                      <div className=" text-muted-foreground">
                        {profile.createdAt.toLocaleTimeString()}
                      </div>
                    </Tooltiper>
                  );
                },
              },
            ]}
          />
          <div className="border-t border-border p-4">
            <Pagination
              cursor={cursor}
              setCursor={setCursor}
              count={count}
              take={limit}
            />
          </div>
        </>
      ) : (
        <FullPageEmptyState title="No profiles" icon={UsersIcon}>
          {cursor !== 0 ? (
            <>
              <p>Looks like you have reached the end of the list</p>
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                onClick={() => setCursor(Math.max(0, count / limit - 1))}
              >
                Go back
              </Button>
            </>
          ) : (
            <p>Looks like there are no profiles here</p>
          )}
        </FullPageEmptyState>
      )}
    </Widget>
  );
}
