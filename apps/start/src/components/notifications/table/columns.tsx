import { formatDateTime, formatTime } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';
import { isToday } from 'date-fns';

import { ColumnCreatedAt } from '@/components/column-created-at';
import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { createHeaderColumn } from '@/components/ui/data-table/data-table-helpers';
import type { RouterOutputs } from '@/trpc/client';
import type { INotificationPayload } from '@openpanel/db';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const columns: ColumnDef<RouterOutputs['notification']['list'][number]>[] = [
    {
      accessorKey: 'title',
      header: t('notifications.column_title'),
      cell({ row }) {
        const { title } = row.original;
        return (
          <div className="row gap-2 items-center">
            {/* {isReadAt === null && <PingBadge>Unread</PingBadge>} */}
            <span className="max-w-md truncate font-medium">{title}</span>
          </div>
        );
      },
      meta: {
        variant: 'text',
        placeholder: t('notifications.search_placeholder'),
        label: t('notifications.column_title'),
      },
    },
    {
      accessorKey: 'message',
      header: t('notifications.column_message'),
      cell({ row }) {
        const { message } = row.original;
        return (
          <div className="inline-flex min-w-full flex-none items-center gap-2">
            {message}
          </div>
        );
      },
      meta: {
        label: t('notifications.column_message'),
        hidden: true,
      },
    },
    {
      accessorKey: 'integration',
      header: t('notifications.column_integration'),
      cell({ row }) {
        const integration = row.original.integration;
        return <div>{integration?.name}</div>;
      },
      meta: {
        label: t('notifications.column_integration'),
      },
    },
    {
      accessorKey: 'notificationRule',
      header: t('notifications.column_rule'),
      cell({ row }) {
        const rule = row.original.notificationRule;
        return <div>{rule?.name}</div>;
      },
      meta: {
        label: t('notifications.column_rule'),
        hidden: true,
      },
    },
    {
      accessorKey: 'country',
      header: t('notifications.column_country'),
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
      meta: {
        label: t('notifications.column_country'),
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
      meta: {
        label: t('notifications.column_os'),
      },
    },
    {
      accessorKey: 'browser',
      header: t('notifications.column_browser'),
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
      meta: {
        label: t('notifications.column_browser'),
      },
    },
    {
      accessorKey: 'profile',
      header: createHeaderColumn(t('notifications.column_profile')),
      cell({ row }) {
        const { payload } = row.original;
        const event = getEventFromPayload(payload);
        if (!event) {
          return null;
        }
        return (
          <ProjectLink
            href={`/profiles/${encodeURIComponent(event.profileId)}`}
            className="inline-flex min-w-full flex-none items-center gap-2"
          >
            {event.profileId}
          </ProjectLink>
        );
      },
      meta: {
        label: t('notifications.column_profile'),
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('notifications.column_created_at'),
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
      filterFn: 'isWithinRange',
      meta: {
        variant: 'dateRange',
        placeholder: t('notifications.column_created_at'),
        label: t('notifications.column_created_at'),
      },
    },
  ];

  return columns;
}
