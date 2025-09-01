import { EventIcon } from '@/components/events/event-icon';
import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useNumber } from '@/hooks/useNumerFormatter';
import { pushModal } from '@/modals';
import { formatDateTime, formatTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import type { ColumnDef } from '@tanstack/react-table';
import { isToday } from 'date-fns';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { IServiceEvent } from '@openpanel/db';

export function useColumns() {
  const number = useNumber();
  const columns: ColumnDef<IServiceEvent>[] = [
    {
      size: 300,
      accessorKey: 'name',
      header: 'Name',
      cell({ row }) {
        const { name, path, duration } = row.original;
        const renderName = () => {
          if (name === 'screen_view') {
            if (path.includes('/')) {
              return <span className="max-w-md truncate">{path}</span>;
            }

            return (
              <>
                <span className="text-muted-foreground">Screen: </span>
                <span className="max-w-md truncate">{path}</span>
              </>
            );
          }

          return name.replace(/_/g, ' ');
        };

        const renderDuration = () => {
          if (name === 'screen_view') {
            return (
              <span className="text-muted-foreground">
                {number.shortWithUnit(duration / 1000, 'min')}
              </span>
            );
          }

          return null;
        };

        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="transition-transform hover:scale-105"
              onClick={() => {
                pushModal('EditEvent', {
                  id: row.original.id,
                });
              }}
            >
              <EventIcon
                size="sm"
                name={row.original.name}
                meta={row.original.meta}
              />
            </button>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  pushModal('EventDetails', {
                    id: row.original.id,
                    createdAt: row.original.createdAt,
                    projectId: row.original.projectId,
                  });
                }}
                className="font-medium"
              >
                {renderName()}
              </button>
              {renderDuration()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created at',
      size: 170,
      cell({ row }) {
        const date = row.original.createdAt;
        return (
          <div>{isToday(date) ? formatTime(date) : formatDateTime(date)}</div>
        );
      },
    },
    {
      accessorKey: 'profileId',
      header: 'Profile',
      cell({ row }) {
        const { profile, profileId, deviceId } = row.original;
        if (profile) {
          return (
            <ProjectLink
              href={`/profiles/${profile.id}`}
              className="whitespace-nowrap font-medium hover:underline"
            >
              {getProfileName(profile)}
            </ProjectLink>
          );
        }

        if (profileId && profileId !== deviceId) {
          return (
            <ProjectLink
              href={`/profiles/${profileId}`}
              className="whitespace-nowrap font-medium hover:underline"
            >
              Unknown
            </ProjectLink>
          );
        }

        if (deviceId) {
          return (
            <ProjectLink
              href={`/profiles/${deviceId}`}
              className="whitespace-nowrap font-medium hover:underline"
            >
              Anonymous
            </ProjectLink>
          );
        }

        return null;
      },
    },
    {
      accessorKey: 'sessionId',
      header: 'Session ID',
      size: 320,
    },
    {
      accessorKey: 'deviceId',
      header: 'Device ID',
      size: 320,
    },
    {
      accessorKey: 'country',
      header: 'Country',
      size: 150,
      cell({ row }) {
        const { country, city } = row.original;
        return (
          <div className="row items-center gap-2 min-w-0">
            <SerieIcon name={country} />
            <span className="truncate">{city}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      header: 'OS',
      size: 130,
      cell({ row }) {
        const { os } = row.original;
        return (
          <div className="row items-center gap-2 min-w-0">
            <SerieIcon name={os} />
            <span className="truncate">{os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'browser',
      header: 'Browser',
      size: 110,
      cell({ row }) {
        const { browser } = row.original;
        return (
          <div className="row items-center gap-2 min-w-0">
            <SerieIcon name={browser} />
            <span className="truncate">{browser}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'properties',
      header: 'Properties',
      size: 400,
      meta: {
        className: 'p-0 [&_pre]:p-4',
      },
      cell({ row }) {
        const { properties } = row.original;
        const filteredProperties = Object.fromEntries(
          Object.entries(properties || {}).filter(
            ([key]) => !key.startsWith('__'),
          ),
        );
        return (
          <ScrollArea orientation="horizontal">
            <pre>{JSON.stringify(filteredProperties)}</pre>
          </ScrollArea>
        );
      },
    },
  ];

  return columns;
}
