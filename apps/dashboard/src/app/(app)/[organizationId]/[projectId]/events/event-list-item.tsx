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
  const { organizationId, projectId } = useAppParams();
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
          'w-full card p-4 flex hover:bg-slate-50 rounded-lg transition-colors justify-between items-center',
          meta?.conversion && `bg-${meta.color}-50 hover:bg-${meta.color}-100`
        )}
      >
        <div className="flex gap-4 items-center text-left text-sm">
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
              href={`/${organizationId}/${projectId}/profiles/${profile?.id}`}
              className="text-muted-foreground text-sm hover:underline whitespace-nowrap max-w-[80px] overflow-hidden text-ellipsis"
            >
              {profile?.firstName} {profile?.lastName}
            </Link>
          </Tooltiper>

          <Tooltiper asChild content={createdAt.toLocaleString()}>
            <div className="text-muted-foreground text-sm">
              {createdAt.toLocaleTimeString()}
            </div>
          </Tooltiper>
        </div>
      </button>
    </>
  );
}
