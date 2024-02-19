'use client';

import type { RouterOutputs } from '@/app/_trpc/client';
import { ListProperties } from '@/components/events/ListProperties';
import { ExpandableListItem } from '@/components/general/ExpandableListItem';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { useAppParams } from '@/hooks/useAppParams';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import Link from 'next/link';

type ProfileListItemProps = RouterOutputs['profile']['list'][number];

export function ProfileListItem(props: ProfileListItemProps) {
  const { id, properties, createdAt } = props;
  const params = useAppParams();

  const renderContent = () => {
    return (
      <>
        <span>{formatDateTime(createdAt)}</span>
        <Link
          href={`/${params.organizationId}/${params.projectId}/profiles/${id}`}
          className="text-black font-medium hover:underline"
        >
          See profile
        </Link>
      </>
    );
  };

  return (
    <ExpandableListItem
      title={getProfileName(props)}
      content={renderContent()}
      image={<ProfileAvatar {...props} />}
    >
      <ListProperties data={properties} className="rounded-none border-none" />
    </ExpandableListItem>
  );
}
