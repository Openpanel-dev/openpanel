'use client';

import { useState } from 'react';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { SerieIcon } from '@/components/report/chart/SerieIcon';
import { KeyValueSubtle } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';

import type { IServiceCreateEventPayload } from '@openpanel/db';

import { EventDetails } from './event-details';
import { EventEdit } from './event-edit';
import { EventIcon } from './event-icon';

type EventListItemProps = IServiceCreateEventPayload;

export function EventListItem(props: EventListItemProps) {
  const {
    profile,
    createdAt,
    name,
    path,
    duration,
    brand,
    browser,
    city,
    country,
    device,
    os,
    projectId,
    meta,
  } = props;
  const params = useAppParams();
  const [, setFilter] = useEventQueryFilters({ shallow: false });
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const number = useNumber();

  return (
    <>
      <EventDetails
        event={props}
        open={isDetailsOpen}
        setOpen={setIsDetailsOpen}
      />
      <EventEdit event={props} open={isEditOpen} setOpen={setIsEditOpen} />
      <div
        className={cn(
          'p-4 flex flex-col gap-2 hover:bg-slate-50 rounded-lg transition-colors',
          meta?.conversion && `bg-${meta.color}-50 hover:bg-${meta.color}-100`
        )}
      >
        <div className="flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <button onClick={() => setIsEditOpen(true)}>
              <EventIcon name={name} meta={meta} projectId={projectId} />
            </button>
            <button
              onClick={() => setIsDetailsOpen(true)}
              className="text-left font-semibold hover:underline"
            >
              {name.replace(/_/g, ' ')}
            </button>
          </div>
          <div className="text-muted-foreground text-sm">
            {createdAt.toLocaleTimeString()}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {path && (
            <KeyValueSubtle
              name={'Path'}
              value={
                path +
                (duration
                  ? ` (${number.shortWithUnit(duration / 1000, 'min')})`
                  : '')
              }
            />
          )}
          {profile && (
            <KeyValueSubtle
              name={'Profile'}
              value={
                <>
                  {profile.avatar && <ProfileAvatar size="xs" {...profile} />}
                  {getProfileName(profile)}
                </>
              }
              href={`/${params.organizationId}/${params.projectId}/profiles/${profile.id}`}
            />
          )}
          <KeyValueSubtle
            name={'From'}
            onClick={() => setFilter('city', city)}
            value={
              <>
                {country && <SerieIcon name={country} />}
                {city}
              </>
            }
          />
          <KeyValueSubtle
            name={'Device'}
            onClick={() => setFilter('device', device)}
            value={
              <>
                {device && <SerieIcon name={device} />}
                {brand || os}
              </>
            }
          />
          {browser !== 'WebKit' && browser !== '' && (
            <KeyValueSubtle
              name={'Browser'}
              onClick={() => setFilter('browser', browser)}
              value={
                <>
                  {browser && <SerieIcon name={browser} />}
                  {browser}
                </>
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
