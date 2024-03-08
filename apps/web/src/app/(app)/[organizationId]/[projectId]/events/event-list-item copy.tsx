'use client';

import { ExpandableListItem } from '@/components/general/ExpandableListItem';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { SerieIcon } from '@/components/report/chart/SerieIcon';
import { KeyValue, KeyValueSubtle } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import { round } from '@/utils/math';
import Link from 'next/link';
import { uniq } from 'ramda';

import type { IServiceCreateEventPayload } from '@mixan/db';

import { EventIcon } from './event-icon';

type EventListItemProps = IServiceCreateEventPayload;

export function EventListItem(props: EventListItemProps) {
  const {
    profile,
    createdAt,
    name,
    properties,
    path,
    duration,
    referrer,
    referrerName,
    referrerType,
    brand,
    model,
    browser,
    browserVersion,
    os,
    osVersion,
    city,
    region,
    country,
    continent,
    device,
    projectId,
    meta,
  } = props;
  const params = useAppParams();
  const [, setEvents] = useEventQueryNamesFilter({ shallow: false });
  const [, setFilter] = useEventQueryFilters({ shallow: false });
  const keyValueList = [
    {
      name: 'Duration',
      value: duration ? round(duration / 1000, 1) : undefined,
    },
    {
      name: 'Referrer',
      value: referrer,
      onClick() {
        setFilter('referrer', referrer ?? '');
      },
    },
    {
      name: 'Referrer name',
      value: referrerName,
      onClick() {
        setFilter('referrer_name', referrerName ?? '');
      },
    },
    {
      name: 'Referrer type',
      value: referrerType,
      onClick() {
        setFilter('referrer_type', referrerType ?? '');
      },
    },
    {
      name: 'Brand',
      value: brand,
      onClick() {
        setFilter('brand', brand ?? '');
      },
    },
    {
      name: 'Model',
      value: model,
      onClick() {
        setFilter('model', model ?? '');
      },
    },
    {
      name: 'Browser',
      value: browser,
      onClick() {
        setFilter('browser', browser ?? '');
      },
    },
    {
      name: 'Browser version',
      value: browserVersion,
      onClick() {
        setFilter('browser_version', browserVersion ?? '');
      },
    },
    {
      name: 'OS',
      value: os,
      onClick() {
        setFilter('os', os ?? '');
      },
    },
    {
      name: 'OS version',
      value: osVersion,
      onClick() {
        setFilter('os_version', osVersion ?? '');
      },
    },
    {
      name: 'City',
      value: city,
      onClick() {
        setFilter('city', city ?? '');
      },
    },
    {
      name: 'Region',
      value: region,
      onClick() {
        setFilter('region', region ?? '');
      },
    },
    {
      name: 'Country',
      value: country,
      onClick() {
        setFilter('country', country ?? '');
      },
    },
    {
      name: 'Continent',
      value: continent,
      onClick() {
        setFilter('continent', continent ?? '');
      },
    },
    {
      name: 'Device',
      value: device,
      onClick() {
        setFilter('device', device ?? '');
      },
    },
  ].filter((item) => typeof item.value === 'string' && item.value);

  const propertiesList = Object.entries(properties)
    .map(([name, value]) => ({
      name,
      value: value as string | number | undefined,
    }))
    .filter((item) => typeof item.value === 'string' && item.value);

  return (
    <div className="p-4 flex gap-4">
      <EventIcon name={name} meta={meta} projectId={projectId} />
      <div>
        {!!profile && (
          <div className="flex gap-2 items-center mb-1">
            <ProfileAvatar size="xs" {...profile} />
            <Link
              className="font-medium text-sm text-muted-foreground"
              href={`/${params.organizationId}/${params.projectId}/profiles/${profile.id}`}
            >
              {getProfileName(profile)}
            </Link>
          </div>
        )}
        <div className="[&>span]:inline text-slate-700">
          <span
            className={cn(
              'font-medium bg-muted p-0.5 px-1 leading-none rounded-md',
              meta?.conversion && `bg-${meta.color}-100 text-${meta.color}-800`
            )}
          >
            {meta?.conversion && '⭐️ '}
            {name}
          </span>
          <span className="text-muted-foreground">{' at '}</span>
          <span>{path}</span>
          <span className="text-muted-foreground">{' from '}</span>
          <span>
            {city || 'Unknown'}, {country}
          </span>
          <span className="text-muted-foreground">{' using '}</span>
          <span className="!inline-flex items-center gap-1">
            {brand || device} <SerieIcon name={device} />
          </span>
        </div>
      </div>
    </div>
  );
  // return (
  //   <ExpandableListItem
  //     className={cn(meta?.conversion && `bg-${meta.color}-50`)}
  //     title={
  //       <button onClick={() => setEvents((p) => uniq([...p, name]))}>
  //         {name.split('_').join(' ')}
  //       </button>
  //     }
  //     content={
  //       <>
  //         <KeyValueSubtle name="Time" value={createdAt.toLocaleString()} />
  //         {profile?.id === props.deviceId && (
  //           <KeyValueSubtle name="Anonymous" value={'Yes'} />
  //         )}
  //         {profile && (
  //           <KeyValueSubtle
  //             name="Profile"
  //             value={getProfileName(profile)}
  //             href={`/${params.organizationId}/${params.projectId}/profiles/${profile.id}`}
  //           />
  //         )}
  //         {path && (
  //           <KeyValueSubtle
  //             name="Path"
  //             value={path}
  //             onClick={() => {
  //               setFilter('path', path);
  //             }}
  //           />
  //         )}
  //       </>
  //     }
  //     image={<EventIcon name={name} meta={meta} projectId={projectId} />}
  //   >
  //     <div className="bg-white p-4">
  //       {propertiesList.length > 0 && (
  //         <div className="flex flex-col gap-4 mb-6">
  //           <div className="font-medium">Your properties</div>
  //           <div className="flex flex-wrap gap-x-4 gap-y-2">
  //             {propertiesList.map((item) => (
  //               <KeyValue
  //                 key={item.name}
  //                 name={item.name}
  //                 value={item.value}
  //                 onClick={() => {
  //                   setFilter(
  //                     `properties.${item.name}`,
  //                     item.value ? String(item.value) : '',
  //                     'is'
  //                   );
  //                 }}
  //               />
  //             ))}
  //           </div>
  //         </div>
  //       )}
  //       <div className="flex flex-col gap-4">
  //         <div className="font-medium">Properties</div>
  //         <div className="flex flex-wrap gap-x-4 gap-y-2">
  //           {keyValueList.map((item) => (
  //             <KeyValue
  //               onClick={() => item.onClick?.()}
  //               key={item.name}
  //               name={item.name}
  //               value={item.value}
  //             />
  //           ))}
  //         </div>
  //       </div>
  //     </div>
  //   </ExpandableListItem>
  // );
}
