import type { IServiceEvent } from '@openpanel/core';
import { memo } from 'react';
import { Skeleton } from '../../skeleton';
import { EventIcon } from '../event-icon';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Tooltiper } from '@/components/ui/tooltip';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { formatTimeAgoOrDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';

interface EventItemProps {
  event: IServiceEvent | Record<string, never>;
  viewOptions: Record<string, boolean | undefined>;
  className?: string;
}

export const EventItem = memo<EventItemProps>(
  ({ event, viewOptions, className }) => {
    let url: string | null = '';
    if (event.path && event.origin) {
      if (viewOptions.origin !== false && event.origin) {
        url += event.origin;
      }
      url += event.path;
      const query = Object.entries(event.properties || {})
        .filter(([key]) => key.startsWith('__query'))
        .map(([key, value]) => [key.replace('__query.', ''), value]);
      if (viewOptions.queryString !== false && query.length) {
        query.forEach(([key, value], index) => {
          url += `${index === 0 ? '?' : '&'}${key}=${value}`;
        });
      }
    }

    return (
      <div className={cn('group card @container overflow-hidden', className)}>
        <div
          className={cn(
            'col flex-1 gap-1 p-2',
            // Desktop
            '@lg:row @lg:items-center',
            'cursor-pointer',
            event.meta?.color
              ? `hover:bg-${event.meta.color}-50 dark:hover:bg-${event.meta.color}-900`
              : 'hover:bg-def-200'
          )}
          data-slot="inner"
          onClick={() => {
            pushModal('EventDetails', {
              id: event.id,
              projectId: event.projectId,
              createdAt: event.createdAt,
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              pushModal('EventDetails', {
                id: event.id,
                projectId: event.projectId,
                createdAt: event.createdAt,
              });
            }
          }}
        >
          <div className="row min-w-0 flex-1 items-center gap-2">
            <button
              className="transition-transform hover:scale-105"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                pushModal('EditEvent', {
                  id: event.id,
                });
              }}
              type="button"
            >
              <EventIcon meta={event.meta} name={event.name} size="sm" />
            </button>
            <span className="wrap-break-word min-w-0 whitespace-break-spaces break-all text-sm leading-normal">
              {event.name === 'screen_view' ? (
                <>
                  <span className="mr-2 text-muted-foreground">Visit:</span>
                  <span className="min-w-0 font-medium">
                    {url ? url : event.path}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">{event.name}</span>
                </>
              )}
            </span>
          </div>
          <div className="row items-center gap-2 @max-lg:pl-8">
            {event.referrerName && viewOptions.referrerName !== false && (
              <Pill
                icon={<SerieIcon className="mr-2" name={event.referrerName} />}
              >
                <span>{event.referrerName}</span>
              </Pill>
            )}
            {event.os && viewOptions.os !== false && (
              <Pill icon={<SerieIcon name={event.os} />}>{event.os}</Pill>
            )}
            {event.browser && viewOptions.browser !== false && (
              <Pill icon={<SerieIcon name={event.browser} />}>
                {event.browser}
              </Pill>
            )}
            {event.country && viewOptions.country !== false && (
              <Pill icon={<SerieIcon name={event.country} />}>
                {event.country}
              </Pill>
            )}
            {viewOptions.profileId !== false && (
              <Pill
                className="@max-xl:ml-auto @max-lg:[&>span]:inline"
                icon={<ProfileAvatar size="xs" {...event.profile} />}
              >
                {getProfileName(event.profile)}
              </Pill>
            )}
            {viewOptions.createdAt !== false && (
              <span className="text-neutral-500 text-sm">
                {formatTimeAgoOrDateTime(event.createdAt)}
              </span>
            )}
          </div>
        </div>
        {viewOptions.properties !== false && (
          <div
            className="border-neutral-200 border-t bg-def-100 p-4 py-2"
            data-slot="extra"
          >
            <pre className="text-sm leading-tight">
              {JSON.stringify(event.properties, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }
);

export const EventItemSkeleton = () => {
  return (
    <div className="card row h-10 items-center gap-4 p-2">
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-3 w-1/2" />
      <div className="row ml-auto gap-2">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="size-4 w-14" />
      </div>
    </div>
  );
};

function Pill({
  children,
  icon,
  className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltiper
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-2 whitespace-nowrap rounded-full font-mono @3xl:text-muted-foreground text-xs',
        className
      )}
      content={children}
    >
      {icon && <div className="center-center size-4">{icon}</div>}
      <div className="@3xl:inline hidden">{children}</div>
    </Tooltiper>
  );
}
