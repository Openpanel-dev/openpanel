import { EventIcon } from '@/components/events/event-icon';
import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { TooltipComplete } from '@/components/tooltip-complete';
import { useNumber } from '@/hooks/useNumerFormatter';
import { pushModal } from '@/modals';
import { formatDateTime, formatTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import type { ColumnDef } from '@tanstack/react-table';
import { isToday } from 'date-fns';

import type { IServiceEvent } from '@openpanel/db';

export function useColumns() {
  const number = useNumber();
  const columns: ColumnDef<IServiceEvent>[] = [
    {
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
            <TooltipComplete content="Click to edit" side="left">
              <button
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
            </TooltipComplete>
            <span className="flex gap-2">
              <button
                onClick={() => {
                  pushModal('EventDetails', {
                    id: row.original.id,
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
      accessorKey: 'country',
      header: 'Country',
      cell({ row }) {
        const { country, city } = row.original;
        return (
          <div className="inline-flex min-w-full flex-none items-center gap-2">
            <SerieIcon name={country} />
            <span>{city}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell({ row }) {
        const { os } = row.original;
        return (
          <div className="flex min-w-full items-center gap-2">
            <SerieIcon name={os} />
            <span>{os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'browser',
      header: 'Browser',
      cell({ row }) {
        const { browser } = row.original;
        return (
          <div className="inline-flex min-w-full flex-none items-center gap-2">
            <SerieIcon name={browser} />
            <span>{browser}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'profileId',
      header: 'Profile',
      cell({ row }) {
        const { profile } = row.original;
        if (!profile) {
          return null;
        }
        return (
          <ProjectLink
            href={`/profiles/${profile?.id}`}
            className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap font-medium hover:underline"
          >
            {getProfileName(profile)}
          </ProjectLink>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created at',
      cell({ row }) {
        const date = row.original.createdAt;
        return (
          <div>{isToday(date) ? formatTime(date) : formatDateTime(date)}</div>
        );
      },
    },
  ];

  return columns;
}
