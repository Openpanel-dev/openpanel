'use client';

import { Fragment, useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Pagination, usePagination } from '@/components/pagination';
import { SerieIcon } from '@/components/report/chart/SerieIcon';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { useDebounceFn } from '@/hooks/useDebounceFn';
import { useDebounceVal } from '@/hooks/useDebounceVal';
import { useNumber } from '@/hooks/useNumerFormatter';
import { api } from '@/trpc/client';
import { formatDate, formatDateTime, formatTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import type { ColumnDef } from '@tanstack/react-table';
import { isSameDay, isToday } from 'date-fns';
import { GanttChartIcon } from 'lucide-react';
import Link from 'next/link';
import { parseAsInteger, useQueryState } from 'nuqs';

import type { IServiceEvent } from '@openpanel/db';
import { IClickhouseEvent } from '@openpanel/db';
import type { IChartEventFilter } from '@openpanel/validation';

import { EventIcon } from './event-icon';
import { EventListItem } from './event-list-item';
import EventListener from './event-listener';

const useDebouncevalue = <T,>(value: T, delay: number): T => {
  const [state, setState] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setState(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return state;
};

type Props = {
  projectId: string;
  filters?: IChartEventFilter[];
  eventNames?: string[];
  profileId?: string;
};

const EventListServer = ({
  projectId,
  eventNames,
  // filters,
  profileId,
}: Props) => {
  const { organizationSlug } = useAppParams();
  const filters: any[] = [];
  const number = useNumber();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0)
  );
  const debouncedCursor = useDebouncevalue(cursor, 500);
  const query = api.event.events.useQuery(
    {
      cursor: debouncedCursor,
      projectId,
      take: 50,
      events: eventNames,
      filters,
      profileId,
    },
    {
      keepPreviousData: true,
    }
  );
  const loading = query.isLoading;
  const data = query.data ?? [];
  const count = Infinity;

  if (data.length === 0 && !loading) {
    return (
      <FullPageEmptyState title="No events here" icon={GanttChartIcon}>
        {cursor !== 0 ? (
          <>
            <p>Looks like you have reached the end of the list</p>
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => setCursor((p) => Math.max(0, p - 1))}
            >
              Go back
            </Button>
          </>
        ) : (
          <>
            {filters.length ? (
              <p>Could not find any events with your filter</p>
            ) : (
              <p>We have not received any events yet</p>
            )}
          </>
        )}
      </FullPageEmptyState>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4"></div>
      </div>
    );
  }

  const columns: ColumnDef<IServiceEvent>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell({ row }) {
        const { name, path, duration } = row.original;
        const renderName = () => {
          if (name === 'screen_view') {
            if (path.includes('/')) {
              return path;
            }

            return `Route: ${path}`;
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
            <EventIcon
              size="sm"
              name={row.original.name}
              meta={row.original.meta}
              projectId={projectId}
            />
            <span className="flex gap-2">
              <span className="font-medium">{renderName()}</span>
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
        const { country } = row.original;
        return (
          <div className="flex items-center gap-2">
            <SerieIcon name={country} />
            {country}
          </div>
        );
      },
    },
    {
      accessorKey: 'city',
      header: 'City',
      cell({ row }) {
        const { city } = row.original;
        return <div className="flex items-center gap-2">{city}</div>;
      },
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell({ row }) {
        const { os } = row.original;
        return (
          <div className="flex items-center gap-2">
            <SerieIcon name={os} />
            {os}
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
          <div className="flex items-center gap-2">
            <SerieIcon name={browser} />
            {browser}
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
          <Link
            href={`/${organizationSlug}/${projectId}/profiles/${profile?.id}`}
            className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap font-medium hover:underline"
          >
            {getProfileName(profile)}
          </Link>
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

  return (
    <>
      <DataTable data={data} columns={columns} />
      <Pagination
        className="mt-2"
        setCursor={setCursor}
        cursor={cursor}
        count={count}
        take={50}
        loading={query.isFetching || cursor !== debouncedCursor}
      />
    </>
  );
};

export default EventListServer;
