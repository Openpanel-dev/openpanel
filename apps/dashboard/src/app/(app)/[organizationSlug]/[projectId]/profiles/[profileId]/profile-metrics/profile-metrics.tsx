'use client';

import { ListPropertiesIcon } from '@/components/events/list-properties-icon';
import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { formatDateTime, utc } from '@/utils/date';
import { formatDistanceToNow } from 'date-fns';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import type { IProfileMetrics, IServiceProfile } from '@openpanel/db';

type Props = {
  data: IProfileMetrics;
  profile: IServiceProfile;
};

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="col gap-2 p-4 ring-[0.5px] ring-border">
      <div className="text-muted-foreground">{title}</div>
      <div className="font-mono truncate text-2xl font-bold">{value}</div>
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="col gap-2">
      <div className="capitalize text-muted-foreground">{title}</div>
      <div className="font-mono truncate">{value || '-'}</div>
    </div>
  );
}

const ProfileMetrics = ({ data, profile }: Props) => {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringEnum(['profile', 'properties']).withDefault('profile')
  );
  const number = useNumber();
  return (
    <div className="@container">
      <div className="grid grid-cols-2 overflow-hidden whitespace-nowrap  rounded-md border bg-background @xl:grid-cols-3 @4xl:grid-cols-6">
        <div className="col-span-2 @xl:col-span-3 @4xl:col-span-6">
          <div className="row border-b">
            <button
              onClick={() => setTab('profile')}
              className={cn(
                'p-4',
                'opacity-50',
                tab === 'profile' &&
                  'border-b border-foreground text-foreground opacity-100'
              )}
            >
              Profile
            </button>
            <div className="h-full w-px bg-border" />
            <button
              onClick={() => setTab('properties')}
              className={cn(
                'p-4',
                'opacity-50',
                tab === 'properties' &&
                  'border-b border-foreground text-foreground opacity-100'
              )}
            >
              Properties
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4">
            {tab === 'profile' && (
              <>
                <Info title="ID" value={profile.id} />
                <Info title="First name" value={profile.firstName} />
                <Info title="Last name" value={profile.lastName} />
                <Info title="Email" value={profile.email} />
                <Info
                  title="Updated"
                  value={formatDateTime(new Date(profile.createdAt))}
                />
                <ListPropertiesIcon {...profile.properties} />
              </>
            )}
            {tab === 'properties' && (
              <>
                {Object.entries(profile.properties)
                  .filter(([key, value]) => value !== undefined)
                  .map(([key, value]) => (
                    <Info key={key} title={key} value={value as string} />
                  ))}
              </>
            )}
          </div>
        </div>
        <Card
          title="First seen"
          value={formatDistanceToNow(utc(data.firstSeen))}
        />
        <Card
          title="Last seen"
          value={formatDistanceToNow(utc(data.lastSeen))}
        />
        <Card title="Sessions" value={number.format(data.sessions)} />
        <Card
          title="Avg. Session"
          value={number.formatWithUnit(data.durationAvg / 1000, 'min')}
        />
        <Card
          title="P90. Session"
          value={number.formatWithUnit(data.durationP90 / 1000, 'min')}
        />
        <Card title="Page views" value={number.format(data.screenViews)} />
      </div>
    </div>
  );
};

export default ProfileMetrics;
