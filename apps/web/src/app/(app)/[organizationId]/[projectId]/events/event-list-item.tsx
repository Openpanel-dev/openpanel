'use client';

import type { RouterOutputs } from '@/app/_trpc/client';
import { ExpandableListItem } from '@/components/general/ExpandableListItem';
import { KeyValue, KeyValueSubtle } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import { getProfileName } from '@/utils/getters';
import { round } from '@/utils/math';
import { useQueryState } from 'nuqs';

import { EventIcon } from './event-icon';

type EventListItemProps = RouterOutputs['event']['list'][number];

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
}: EventListItemProps) {
  const params = useAppParams();

  const [, setPath] = useQueryState('path');
  const [, setReferrer] = useQueryState('referrer');
  const [, setReferrerName] = useQueryState('referrerName');
  const [, setReferrerType] = useQueryState('referrerType');
  const [, setBrand] = useQueryState('brand');
  const [, setModel] = useQueryState('model');
  const [, setBrowser] = useQueryState('browser');
  const [, setBrowserVersion] = useQueryState('browserVersion');
  const [, setOs] = useQueryState('os');
  const [, setOsVersion] = useQueryState('osVersion');
  const [, setCity] = useQueryState('city');
  const [, setRegion] = useQueryState('region');
  const [, setCountry] = useQueryState('country');
  const [, setContinent] = useQueryState('continent');
  const [, setDevice] = useQueryState('device');

  const keyValueList = [
    {
      name: 'Duration',
      value: duration ? round(duration / 1000, 1) : undefined,
    },
    {
      name: 'Referrer',
      value: referrer,
      onClick() {
        setReferrer(referrer ?? null);
      },
    },
    {
      name: 'Referrer name',
      value: referrerName,
      onClick() {
        setReferrerName(referrerName ?? null);
      },
    },
    {
      name: 'Referrer type',
      value: referrerType,
      onClick() {
        setReferrerType(referrerType ?? null);
      },
    },
    {
      name: 'Brand',
      value: brand,
      onClick() {
        setBrand(brand ?? null);
      },
    },
    {
      name: 'Model',
      value: model,
      onClick() {
        setModel(model ?? null);
      },
    },
    {
      name: 'Browser',
      value: browser,
      onClick() {
        setBrowser(browser ?? null);
      },
    },
    {
      name: 'Browser version',
      value: browserVersion,
      onClick() {
        setBrowserVersion(browserVersion ?? null);
      },
    },
    {
      name: 'OS',
      value: os,
      onClick() {
        setOs(os ?? null);
      },
    },
    {
      name: 'OS cersion',
      value: osVersion,
      onClick() {
        setOsVersion(osVersion ?? null);
      },
    },
    {
      name: 'City',
      value: city,
      onClick() {
        setCity(city ?? null);
      },
    },
    {
      name: 'Region',
      value: region,
      onClick() {
        setRegion(region ?? null);
      },
    },
    {
      name: 'Country',
      value: country,
      onClick() {
        setCountry(country ?? null);
      },
    },
    {
      name: 'Continent',
      value: continent,
      onClick() {
        setContinent(continent ?? null);
      },
    },
    {
      name: 'Device',
      value: device,
      onClick() {
        setDevice(device ?? null);
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
                setPath(path);
              }}
            />
          )}
        </>
      }
      image={<EventIcon name={name} />}
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
