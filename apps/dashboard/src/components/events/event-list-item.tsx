'use client';

import { Tooltiper } from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/useAppParams';
import { useNumber } from '@/hooks/useNumerFormatter';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import Link from 'next/link';

import type { IServiceEvent, IServiceEventMinimal } from '@openpanel/db';

import { SerieIcon } from '../report-chart/common/serie-icon';
import { EventIcon } from './event-icon';

type EventListItemProps = IServiceEventMinimal | IServiceEvent;

export function EventListItem(props: EventListItemProps) {
  const { organizationId, projectId } = useAppParams();
  const { createdAt, name, path, duration, meta } = props;
  const profile = 'profile' in props ? props.profile : null;

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

  const isMinimal = 'minimal' in props;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!isMinimal) {
            pushModal('EventDetails', {
              id: props.id,
              projectId,
              createdAt,
            });
          }
        }}
        className={cn(
          'card hover:bg-light-background flex w-full items-center justify-between rounded-lg p-4 transition-colors',
          meta?.conversion &&
            `bg-${meta.color}-50 dark:bg-${meta.color}-900 hover:bg-${meta.color}-100 dark:hover:bg-${meta.color}-700`,
        )}
      >
        <div>
          <div className="flex items-center gap-4 text-left ">
            <EventIcon size="sm" name={name} meta={meta} />
            <span>
              <span className="font-medium">{renderName()}</span>
              {'  '}
              {renderDuration()}
            </span>
          </div>
          <div className="pl-10">
            <div className="flex origin-left scale-75 gap-1">
              <SerieIcon name={props.country} />
              <SerieIcon name={props.os} />
              <SerieIcon name={props.browser} />
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <Tooltiper asChild content={getProfileName(profile)}>
            <Link
              onClick={(e) => {
                e.stopPropagation();
              }}
              href={`/${organizationId}/${projectId}/profiles/${profile?.id}`}
              className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap  text-muted-foreground hover:underline"
            >
              {getProfileName(profile)}
            </Link>
          </Tooltiper>

          <Tooltiper asChild content={createdAt.toLocaleString()}>
            <div className=" text-muted-foreground">
              {createdAt.toLocaleTimeString()}
            </div>
          </Tooltiper>
        </div>
      </button>
    </>
  );
}
