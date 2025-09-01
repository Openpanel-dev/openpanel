import { useNumber } from '@/hooks/useNumerFormatter';
import { formatDateTime, formatTime } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';
import { isToday } from 'date-fns';

import { ProjectLink } from '@/components/links';
import { PingBadge } from '@/components/ping';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import type { RouterOutputs } from '@/trpc/client';
import type { INotificationPayload } from '@openpanel/db';

function getEventFromPayload(payload: INotificationPayload | null) {
  if (payload?.type === 'event') {
    return payload.event;
  }
  if (payload?.type === 'funnel') {
    return payload.funnel[0] || null;
  }
  return null;
}

export function useColumns() {
  const columns: ColumnDef<RouterOutputs['notification']['list'][number]>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell({ row }) {
        const { title, isReadAt } = row.original;
        return (
          <div className="row gap-2 items-center">
            {/* {isReadAt === null && <PingBadge>Unread</PingBadge>} */}
            <span className="max-w-md truncate font-medium">{title}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'message',
      header: 'Message',
      cell({ row }) {
        const { message } = row.original;
        return (
          <div className="inline-flex min-w-full flex-none items-center gap-2">
            {message}
          </div>
        );
      },
    },
    {
      accessorKey: 'integration',
      header: 'Integration',
      cell({ row }) {
        const integration = row.original.integration;
        return <div>{integration?.name}</div>;
      },
    },
    {
      accessorKey: 'notificationRule',
      header: 'Rule',
      cell({ row }) {
        const rule = row.original.notificationRule;
        return <div>{rule?.name}</div>;
      },
    },
    {
      accessorKey: 'country',
      header: 'Country',
      cell({ row }) {
        const { payload } = row.original;
        const event = getEventFromPayload(payload);
        if (!event) {
          return null;
        }
        return (
          <div className="inline-flex min-w-full flex-none items-center gap-2">
            <SerieIcon name={event.country} />
            <span>{event.city}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell({ row }) {
        const { payload } = row.original;
        const event = getEventFromPayload(payload);
        if (!event) {
          return null;
        }
        return (
          <div className="flex min-w-full items-center gap-2">
            <SerieIcon name={event.os} />
            <span>{event.os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'browser',
      header: 'Browser',
      cell({ row }) {
        const { payload } = row.original;
        const event = getEventFromPayload(payload);
        if (!event) {
          return null;
        }
        return (
          <div className="inline-flex min-w-full flex-none items-center gap-2">
            <SerieIcon name={event.browser} />
            <span>{event.browser}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'profile',
      header: 'Profile',
      cell({ row }) {
        const { payload } = row.original;
        const event = getEventFromPayload(payload);
        if (!event) {
          return null;
        }
        return (
          <ProjectLink
            href={`/profiles/${event.profileId}`}
            className="inline-flex min-w-full flex-none items-center gap-2"
          >
            {event.profileId}
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
