import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { Widget } from '@/components/widget';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/date';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import type { IServiceEvent, IServiceProfile } from '@openpanel/db';
import { FullPageEmptyState } from '../full-page-empty-state';
import { WidgetButtons, WidgetHead } from '../overview/overview-widget';

type Props = {
  profile: IServiceProfile;
};

export const ProfileProperties = ({ profile }: Props) => {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringEnum(['profile', 'properties']).withDefault('profile'),
  );

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Profile Information</div>
        <WidgetButtons>
          {[
            {
              key: 'profile',
              btn: 'Profile',
            },
            {
              key: 'properties',
              btn: 'Properties',
            },
          ].map((w) => (
            <button
              type="button"
              key={w.key}
              onClick={() => setTab(w.key as 'profile' | 'properties')}
              className={cn(w.key === tab && 'active')}
            >
              {w.btn}
            </button>
          ))}
        </WidgetButtons>
      </WidgetHead>

      {tab === 'profile' && profile && (
        <KeyValueGrid
          copyable
          className="border-0"
          columns={3}
          data={[
            { name: 'id', value: profile.id },
            { name: 'firstName', value: profile.firstName },
            { name: 'lastName', value: profile.lastName },
            { name: 'email', value: profile.email },
            { name: 'isExternal', value: profile.isExternal ? 'Yes' : 'No' },
            {
              name: 'createdAt',
              value: formatDateTime(new Date(profile.createdAt)),
            },
            ...(profile.properties.country
              ? [{ name: 'country', value: profile.properties.country }]
              : []),
            ...(profile.properties.city
              ? [{ name: 'city', value: profile.properties.city }]
              : []),
            ...(profile.properties.os
              ? [{ name: 'os', value: profile.properties.os }]
              : []),
            ...(profile.properties.browser
              ? [{ name: 'browser', value: profile.properties.browser }]
              : []),
            ...(profile.properties.device
              ? [{ name: 'device', value: profile.properties.device }]
              : []),
            ...(profile.properties.referrer_name
              ? [
                  {
                    name: 'referrerName',
                    value: profile.properties.referrer_name,
                  },
                ]
              : []),
          ].map((item) => ({
            ...item,
            event: {
              ...profile,
              ...profile.properties,
            } as unknown as IServiceEvent,
          }))}
        />
      )}

      {tab === 'properties' && profile && (
        <KeyValueGrid
          copyable
          className="border-0"
          columns={3}
          data={Object.entries(profile.properties)
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([key, value]) => ({
              name: key,
              value: value,
              event: {
                ...profile,
                ...profile.properties,
              } as unknown as IServiceEvent,
            }))}
        />
      )}
      {(!profile || !profile.properties) && (
        <FullPageEmptyState title="No properties found" />
      )}
    </Widget>
  );
};
