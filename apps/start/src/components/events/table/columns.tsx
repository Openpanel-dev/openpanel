import type { IServiceEvent } from '@openpanel/db';
import type { ColumnDef } from '@tanstack/react-table';
import { ColumnCreatedAt } from '@/components/column-created-at';
import { EventIcon } from '@/components/events/event-icon';
import { ProjectLink } from '@/components/links';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { useNumber } from '@/hooks/use-numer-formatter';
import { pushModal } from '@/modals';
import { getProfileName } from '@/utils/getters';
import { useTranslation } from 'react-i18next';

export function useColumns() {
  const { t } = useTranslation();
  const number = useNumber();
  const columns: ColumnDef<IServiceEvent>[] = [
    {
      accessorKey: 'createdAt',
      header: t('events.column_created_at'),
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const session = row.original;
        return <ColumnCreatedAt>{session.createdAt}</ColumnCreatedAt>;
      },
    },
    {
      size: 300,
      accessorKey: 'name',
      header: t('events.column_name'),
      cell({ row }) {
        const { name, path, revenue } = row.original;
        const fullTitle =
          name === 'screen_view'
            ? path
            : name === 'revenue' && revenue
              ? `${name} (${number.currency(revenue / 100)})`
              : name.replace(/_/g, ' ');

        const renderName = () => {
          if (name === 'screen_view') {
            if (path.includes('/')) {
              return path;
            }

            return (
              <>
                <span className="text-muted-foreground">
                  {t('events.screen_label')}{' '}
                </span>
                {path}
              </>
            );
          }

          if (name === 'revenue' && revenue) {
            return `${name} (${number.currency(revenue / 100)})`;
          }

          return name.replace(/_/g, ' ');
        };

        return (
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="shrink-0 transition-transform hover:scale-105"
              onClick={() => {
                pushModal('EditEvent', {
                  id: row.original.id,
                });
              }}
              type="button"
            >
              <EventIcon
                meta={row.original.meta}
                name={row.original.name}
                size="sm"
              />
            </button>
            <span className="flex min-w-0 flex-1 gap-2">
              <button
                className="min-w-0 max-w-full truncate text-left font-medium hover:underline"
                onClick={() => {
                  pushModal('EventDetails', {
                    id: row.original.id,
                    createdAt: row.original.createdAt,
                    projectId: row.original.projectId,
                  });
                }}
                title={fullTitle}
                type="button"
              >
                <span className="block truncate">{renderName()}</span>
              </button>
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'profileId',
      header: t('events.column_profile'),
      cell({ row }) {
        const { profile, profileId, deviceId } = row.original;
        if (profile) {
          return (
            <ProjectLink
              className="group row items-center gap-2 whitespace-nowrap font-medium hover:underline"
              href={`/profiles/${encodeURIComponent(profile.id)}`}
            >
              <ProfileAvatar size="sm" {...profile} />
              {getProfileName(profile)}
            </ProjectLink>
          );
        }

        if (profileId && profileId !== deviceId) {
          return (
            <ProjectLink
              className="whitespace-nowrap font-medium hover:underline"
              href={`/profiles/${encodeURIComponent(profileId)}`}
            >
              {t('events.unknown_profile')}
            </ProjectLink>
          );
        }

        if (deviceId) {
          return (
            <ProjectLink
              className="whitespace-nowrap font-medium hover:underline"
              href={`/profiles/${encodeURIComponent(deviceId)}`}
            >
              {t('events.anonymous_profile')}
            </ProjectLink>
          );
        }

        return null;
      },
    },
    {
      accessorKey: 'sessionId',
      header: t('events.column_session_id'),
      size: 100,
      meta: {
        hidden: true,
      },
      cell({ row }) {
        const { sessionId } = row.original;
        return (
          <ProjectLink
            className="whitespace-nowrap font-medium hover:underline"
            href={`/sessions/${encodeURIComponent(sessionId)}`}
          >
            {sessionId.slice(0, 6)}
          </ProjectLink>
        );
      },
    },
    {
      accessorKey: 'deviceId',
      header: t('events.column_device_id'),
      size: 320,
      meta: {
        hidden: true,
      },
    },
    {
      accessorKey: 'country',
      header: t('events.column_country'),
      size: 150,
      cell({ row }) {
        const { country, city } = row.original;
        return (
          <div className="row min-w-0 items-center gap-2">
            <SerieIcon name={country} />
            <span className="truncate">{city}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      header: t('events.column_os'),
      size: 130,
      cell({ row }) {
        const { os } = row.original;
        return (
          <div className="row min-w-0 items-center gap-2">
            <SerieIcon name={os} />
            <span className="truncate">{os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'browser',
      header: t('events.column_browser'),
      size: 110,
      cell({ row }) {
        const { browser } = row.original;
        return (
          <div className="row min-w-0 items-center gap-2">
            <SerieIcon name={browser} />
            <span className="truncate">{browser}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'groups',
      header: t('events.column_groups'),
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
              <span
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                key={g}
              >
                {g}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'properties',
      header: t('events.column_properties'),
      size: 400,
      meta: {
        hidden: true,
      },
      cell({ row }) {
        const { properties } = row.original;
        const filteredProperties = Object.fromEntries(
          Object.entries(properties || {}).filter(
            ([key]) => !key.startsWith('__')
          )
        );
        const items = Object.entries(filteredProperties);
        const limit = 2;
        const data = items.slice(0, limit).map(([key, value]) => ({
          name: key,
          value,
        }));
        if (items.length > limit) {
          data.push({
            name: '',
            value: t('events.more_properties_count', {
              count: items.length - limit,
            }),
          });
        }

        if (data.length === 0) {
          return null;
        }

        return <KeyValueGrid className="w-full" data={data} />;
      },
    },
  ];

  return columns;
}
