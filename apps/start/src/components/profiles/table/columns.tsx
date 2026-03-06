import type { IServiceProfile } from '@openpanel/db';
import type { ColumnDef } from '@tanstack/react-table';
import { ProfileAvatar } from '../profile-avatar';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { getProfileName } from '@/utils/getters';

export function useColumns(type: 'profiles' | 'power-users') {
  const columns: ColumnDef<IServiceProfile>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <ProjectLink
            className="flex items-center gap-2 font-medium"
            href={`/profiles/${encodeURIComponent(profile.id)}`}
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
      accessorKey: 'model',
      header: 'Model',
      cell({ row }) {
        const { model, brand } = row.original.properties;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={brand} />
            <span className="truncate">
              {brand} / {model}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'First seen',
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
    },
    {
      accessorKey: 'groups',
      header: 'Groups',
      size: 200,
      meta: {
        hidden: true,
      },
      cell({ row }) {
        const { groups } = row.original;
        if (!groups?.length) {
          return null;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <ProjectLink
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline"
                href={`/groups/${encodeURIComponent(g)}`}
                key={g}
              >
                {g}
              </ProjectLink>
            ))}
          </div>
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
