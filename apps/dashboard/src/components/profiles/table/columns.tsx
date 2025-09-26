import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Tooltiper } from '@/components/ui/tooltip';
import { formatDateTime, formatTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import type { ColumnDef } from '@tanstack/react-table';
import { isToday } from 'date-fns';

import type { IServiceProfile } from '@openpanel/db';

import { ProfileAvatar } from '../profile-avatar';

export function useColumns(type?: 'profiles' | 'power-users') {
  const columns: ColumnDef<IServiceProfile>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <ProjectLink
            href={`/profiles/${profile.id}`}
            className="flex items-center gap-2 font-medium"
            title={getProfileName(profile, false)}
          >
            <ProfileAvatar size="sm" {...profile} />
            {getProfileName(profile)}
          </ProjectLink>
        );
      },
    },
    {
      accessorKey: 'referrer',
      header: 'Referrer',
      cell({ row }) {
        const { referrer, referrer_name } = row.original.properties;
        const ref = referrer_name || referrer;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={ref} />
            <span className="truncate">{ref}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'country',
      header: 'Country',
      cell({ row }) {
        const { country, city } = row.original.properties;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={country} />
            <span className="truncate">{city}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell({ row }) {
        const { os } = row.original.properties;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={os} />
            <span className="truncate">{os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'browser',
      header: 'Browser',
      cell({ row }) {
        const { browser } = row.original.properties;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={browser} />
            <span className="truncate">{browser}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Last seen',
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <Tooltiper asChild content={formatDateTime(profile.createdAt)}>
            <div className="text-muted-foreground">
              {isToday(profile.createdAt)
                ? formatTime(profile.createdAt)
                : formatDateTime(profile.createdAt)}
            </div>
          </Tooltiper>
        );
      },
    },
  ];

  if (type === 'power-users') {
    columns.unshift({
      accessorKey: 'count',
      header: 'Events',
      cell: ({ row }) => {
        const profile = row.original;
        // @ts-expect-error
        return <div>{profile.count}</div>;
      },
    });
  }

  return columns;
}
