import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { formatTimeAgoOrDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import type { IServiceEvent } from '@openpanel/db';
import { memo } from 'react';
import { Skeleton } from '../../skeleton';
import { EventIcon } from '../event-icon';

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
          data-slot="inner"
          className={cn(
            'col gap-2 flex-1 p-2',
            // Desktop
            '@lg:row @lg:items-center',
            'cursor-pointer',
            event.meta?.color
              ? `hover:bg-${event.meta.color}-50 dark:hover:bg-${event.meta.color}-900`
              : 'hover:bg-def-200',
          )}
        >
          <div className="min-w-0 flex-1 row items-center gap-4">
            <button
              type="button"
              className="transition-transform hover:scale-105"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                pushModal('EditEvent', {
                  id: event.id,
                });
              }}
            >
              <EventIcon name={event.name} size="sm" meta={event.meta} />
            </button>
            <span className="min-w-0 whitespace-break-spaces wrap-break-word break-all">
              {event.name === 'screen_view' ? (
                <>
                  <span className="text-muted-foreground mr-2">Visit:</span>
                  <span className="font-medium min-w-0">
                    {url ? url : event.path}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground mr-2">Event:</span>
                  <span className="font-medium">{event.name}</span>
                </>
              )}
            </span>
          </div>
          <div className="row gap-2 items-center @max-lg:pl-10">
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
              <span className="text-sm text-neutral-500">
                {formatTimeAgoOrDateTime(event.createdAt)}
              </span>
            )}
          </div>
        </div>
        {viewOptions.properties !== false && (
          <div
            data-slot="extra"
            className="border-t border-neutral-200 p-4 py-2 bg-def-100"
          >
            <pre className="text-sm leading-tight">
              {JSON.stringify(event.properties, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  },
);

export const EventItemSkeleton = () => {
  return (
    <div className="card h-10 p-2 gap-4 row items-center">
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="w-1/2 h-3" />
      <div className="row gap-2 ml-auto">
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
}: { children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'shrink-0 whitespace-nowrap inline-flex gap-2 items-center rounded-full @3xl:px-2.5 @3xl:py-0.5 text-sm/5 @3xl:bg-neutral-100 @3xl:text-neutral-700 h-6',
        className,
      )}
    >
      {icon && <div className="size-4 center-center">{icon}</div>}
      <div className="hidden @3xl:inline">{children}</div>
    </div>
  );
}
