'use client';

import { useMemo } from 'react';
import type { RouterOutputs } from '@/app/_trpc/client';
import { ListProperties } from '@/components/events/ListProperties';
import { ExpandableListItem } from '@/components/general/ExpandableListItem';
import { ProfileAvatar } from '@/components/profiles/ProfileAvatar';
import { useAppParams } from '@/hooks/useAppParams';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import { round } from '@/utils/math';
import Link from 'next/link';

import { EventIcon } from './event-icon';

type EventListItemProps = RouterOutputs['event']['list'][number];

export function EventListItem({
  profile,
  createdAt,
  name,
  properties,
}: EventListItemProps) {
  const params = useAppParams();

  const bullets = useMemo(() => {
    const bullets: React.ReactNode[] = [
      <span>{formatDateTime(createdAt)}</span>,
    ];

    if (profile) {
      bullets.push(
        <Link
          href={`/${params.organizationId}/${params.projectId}/profiles/${profile.id}`}
          className="flex items-center gap-1 text-black font-medium hover:underline"
        >
          <ProfileAvatar size="xs" {...(profile ?? {})}></ProfileAvatar>
          {getProfileName(profile)}
        </Link>
      );
    }

    if (typeof properties.duration === 'number') {
      bullets.push(`${round(properties.duration / 1000, 1)}s`);
    }

    switch (name) {
      case 'screen_view': {
        const route = (properties?.route || properties?.path)!;
        if (route) {
          bullets.push(route);
        }
        break;
      }
    }

    return bullets;
  }, [name, createdAt, profile, properties, params]);

  return (
    <ExpandableListItem
      title={name.split('_').join(' ')}
      bullets={bullets}
      image={<EventIcon name={name} />}
    >
      <ListProperties data={properties} className="rounded-none border-none" />
    </ExpandableListItem>
  );
}
