'use client';

import { ExpandableListItem } from '@/components/general/ExpandableListItem';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { KeyValue, KeyValueSubtle } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { getProfileName } from '@/utils/getters';

import type { IServiceProfile } from '@mixan/db';

type ProfileListItemProps = IServiceProfile;

export function ProfileListItem(props: ProfileListItemProps) {
  const { id, properties, createdAt } = props;
  const params = useAppParams();
  const [, setFilter] = useEventQueryFilters({ shallow: false });

  const renderContent = () => {
    return (
      <>
        <KeyValueSubtle name="Time" value={createdAt.toLocaleString()} />
        <KeyValueSubtle
          href={`/${params.organizationId}/${params.projectId}/profiles/${id}`}
          name="Details"
          value={'See profile'}
        />
      </>
    );
  };

  return (
    <ExpandableListItem
      title={getProfileName(props)}
      content={renderContent()}
      image={<ProfileAvatar {...props} />}
    >
      <>
        {properties && (
          <div className="bg-white p-4 flex flex-col gap-4">
            <div className="font-medium">Properties</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(properties)
                .filter(([, value]) => !!value)
                .map(([key, value]) => (
                  <KeyValue
                    onClick={() => setFilter(`properties.${key}`, value)}
                    key={key}
                    name={key}
                    value={value}
                  />
                ))}
            </div>
          </div>
        )}
      </>
    </ExpandableListItem>
  );
}
