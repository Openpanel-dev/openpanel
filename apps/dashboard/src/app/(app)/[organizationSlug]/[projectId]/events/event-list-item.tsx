'use client';

import { useState } from 'react';
import { Tooltiper } from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/useAppParams';
import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import Link from 'next/link';

import type { IServiceCreateEventPayload } from '@openpanel/db';

import { EventDetails } from './event-details';
import { EventIcon } from './event-icon';

type EventListItemProps = IServiceCreateEventPayload;

export function EventListItem(props: EventListItemProps) {
  const { organizationSlug, projectId } = useAppParams();
  const { createdAt, name, path, duration, meta, profile } = props;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const number = useNumber();

  const renderName = () => {
    if (name === 'screen_view') {
      if (path.includes('/')) {
        return path;
      }

      return `Route: ${path}`;
    }

    return name.replace(/_/g, ' ');
  };

  const renderDuration = () => {
    if (name === 'screen_view') {
      return (
        <span className="text-muted-foreground">
          {number.shortWithUnit(duration / 1000, 'min')}
        </span>
      );
    }

    return null;
  };

  return (
    <>
      <EventDetails
        event={props}
        open={isDetailsOpen}
        setOpen={setIsDetailsOpen}
      />
      <button
        onClick={() => setIsDetailsOpen(true)}
        className={cn(
          'card hover:bg-light-background flex w-full items-center justify-between rounded-lg p-4 transition-colors',
          meta?.conversion &&
            `bg-${meta.color}-50 dark:bg-${meta.color}-900 hover:bg-${meta.color}-100 dark:hover:bg-${meta.color}-700`
        )}
      >
        <div className="flex items-center gap-4 text-left text-sm">
          <EventIcon size="sm" name={name} meta={meta} projectId={projectId} />
          <span>
            <span className="font-medium">{renderName()}</span>
            {'  '}
            {renderDuration()}
          </span>
        </div>
        <div className="flex gap-4">
          <Tooltiper
            asChild
            content={`${profile?.firstName} ${profile?.lastName}`}
          >
            <Link
              onClick={(e) => {
                e.stopPropagation();
              }}
              href={`/${organizationSlug}/${projectId}/profiles/${profile?.id}`}
              className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground hover:underline"
            >
              {profile?.firstName} {profile?.lastName}
            </Link>
          </Tooltiper>

          <Tooltiper asChild content={createdAt.toLocaleString()}>
            <div className="text-sm text-muted-foreground">
              {createdAt.toLocaleTimeString()}
            </div>
          </Tooltiper>
        </div>
      </button>
    </>
  );
}
