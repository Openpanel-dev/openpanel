'use client';

import type { RouterOutputs } from '@/app/_trpc/client';
import { ExpandableListItem } from '@/components/general/ExpandableListItem';
import { KeyValue, KeyValueSubtle } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import { round } from '@/utils/math';

import type { IServiceCreateEventPayload } from '@mixan/db';

import { EventIcon } from './event-icon';

type EventListItemProps = IServiceCreateEventPayload;

export function EventListItem({
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
}: EventListItemProps) {
  const params = useAppParams();
  const eventQueryFilters = useEventQueryFilters({ shallow: false });
  const keyValueList = [
    {
      name: 'Duration',
      value: duration ? round(duration / 1000, 1) : undefined,
    },
    {
      name: 'Referrer',
      value: referrer,
      onClick() {
        eventQueryFilters.referrer.set(referrer ?? null);
      },
    },
    {
      name: 'Referrer name',
      value: referrerName,
      onClick() {
        eventQueryFilters.referrerName.set(referrerName ?? null);
      },
    },
    {
      name: 'Referrer type',
      value: referrerType,
      onClick() {
        eventQueryFilters.referrerType.set(referrerType ?? null);
      },
    },
    {
      name: 'Brand',
      value: brand,
      onClick() {
        eventQueryFilters.brand.set(brand ?? null);
      },
    },
    {
      name: 'Model',
      value: model,
      onClick() {
        eventQueryFilters.model.set(model ?? null);
      },
    },
    {
      name: 'Browser',
      value: browser,
      onClick() {
        eventQueryFilters.browser.set(browser ?? null);
      },
    },
    {
      name: 'Browser version',
      value: browserVersion,
      onClick() {
        eventQueryFilters.browserVersion.set(browserVersion ?? null);
      },
    },
    {
      name: 'OS',
      value: os,
      onClick() {
        eventQueryFilters.os.set(os ?? null);
      },
    },
    {
      name: 'OS cersion',
      value: osVersion,
      onClick() {
        eventQueryFilters.osVersion.set(osVersion ?? null);
      },
    },
    {
      name: 'City',
      value: city,
      onClick() {
        eventQueryFilters.city.set(city ?? null);
      },
    },
    {
      name: 'Region',
      value: region,
      onClick() {
        eventQueryFilters.region.set(region ?? null);
      },
    },
    {
      name: 'Country',
      value: country,
      onClick() {
        eventQueryFilters.country.set(country ?? null);
      },
    },
    {
      name: 'Continent',
      value: continent,
      onClick() {
        eventQueryFilters.continent.set(continent ?? null);
      },
    },
    {
      name: 'Device',
      value: device,
      onClick() {
        eventQueryFilters.device.set(device ?? null);
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
    <ExpandableListItem
      className={cn(meta?.conversion && 'ring-2 ring-primary-500')}
      title={name.split('_').join(' ')}
      content={
        <>
          <KeyValueSubtle name="Time" value={createdAt.toLocaleString()} />
          {profile && (
            <KeyValueSubtle
              name="Profile"
              value={getProfileName(profile)}
              href={`/${params.organizationId}/${params.projectId}/profiles/${profile.id}`}
            />
          )}
          {path && (
            <KeyValueSubtle
              name="Path"
              value={path}
              onClick={() => {
                eventQueryFilters.path.set(path);
              }}
            />
          )}
        </>
      }
      image={<EventIcon name={name} meta={meta} projectId={projectId} />}
    >
      <div className="p-2">
        <div className="bg-gradient-to-tr from-slate-100 to-white rounded-md">
          {propertiesList.length > 0 && (
            <div className="p-4 flex flex-col gap-4">
              <div className="font-medium">Your properties</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {propertiesList.map((item) => (
                  <KeyValue
                    key={item.name}
                    name={item.name}
                    value={item.value}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="p-4 flex flex-col gap-4">
            <div className="font-medium">Properties</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {keyValueList.map((item) => (
                <KeyValue
                  onClick={() => item.onClick?.()}
                  key={item.name}
                  name={item.name}
                  value={item.value}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </ExpandableListItem>
  );
}
