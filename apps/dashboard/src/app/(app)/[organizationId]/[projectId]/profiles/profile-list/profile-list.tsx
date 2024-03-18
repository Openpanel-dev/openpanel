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
import { UsersIcon } from 'lucide-react';
import Link from 'next/link';

import { getProfileName } from '@openpanel/db';
import type { IServiceProfile } from '@openpanel/db';

interface ProfileListProps {
  data: IServiceProfile[];
  count: number;
}
export function ProfileList({ data, count }: ProfileListProps) {
  const { organizationId, projectId } = useAppParams();
  const { cursor, setCursor } = useCursor();
  return (
    <Widget>
      <WidgetHead className="flex justify-between items-center">
        <div className="title">Profiles</div>
        <Pagination
          size="sm"
          cursor={cursor}
          setCursor={setCursor}
          count={count}
          take={10}
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
                      href={`/${organizationId}/${projectId}/profiles/${profile.id}`}
                      className="flex gap-2 items-center font-medium"
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
                      <div className="text-muted-foreground text-sm">
                        {profile.createdAt.toLocaleTimeString()}
                      </div>
                    </Tooltiper>
                  );
                },
              },
            ]}
          />
          <div className="p-4 border-t border-border">
            <Pagination
              cursor={cursor}
              setCursor={setCursor}
              count={count}
              take={10}
            />
          </div>
        </>
      ) : (
        <FullPageEmptyState title="No profiles here" icon={UsersIcon}>
          {cursor !== 0 ? (
            <>
              <p>Looks like you have reached the end of the list</p>
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                onClick={() => setCursor(count / 10 - 1)}
              >
                Go back
              </Button>
            </>
          ) : (
            <p>Looks like there is no profiles here</p>
          )}
        </FullPageEmptyState>
      )}
    </Widget>
  );
}
