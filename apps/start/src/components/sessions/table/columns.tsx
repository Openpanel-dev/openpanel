import { ProjectLink } from '@/components/links';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Tooltiper } from '@/components/ui/tooltip';
import { formatDateTime, formatTimeAgoOrDateTime } from '@/utils/date';
import type { ColumnDef } from '@tanstack/react-table';

import { getProfileName } from '@/utils/getters';
import { round } from '@openpanel/common';
import type { IServiceSession } from '@openpanel/db';

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  if (seconds < 60) {
    return `${round(seconds, 1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${round(remainingSeconds, 0)}s`
      : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${round(remainingMinutes, 0)}m`;
}

export function useColumns() {
  const columns: ColumnDef<IServiceSession>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Started',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <Tooltiper asChild content={formatDateTime(session.createdAt)}>
            <div className="text-muted-foreground">
              {formatTimeAgoOrDateTime(session.createdAt)}
            </div>
          </Tooltiper>
        );
      },
    },
    {
      accessorKey: 'id',
      header: 'Session ID',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <ProjectLink
            href={`/sessions/${session.id}`}
            className="font-mono text-sm font-medium"
            title={session.id}
          >
            {session.id.slice(0, 8)}...
          </ProjectLink>
        );
      },
    },
    {
      accessorKey: 'profileId',
      header: 'Profile',
      cell: ({ row }) => {
        const session = row.original;
        if (session.profile) {
          return (
            <ProjectLink
              href={`/profiles/${session.profile.id}`}
              className="font-medium"
            >
              {getProfileName(session.profile)}
            </ProjectLink>
          );
        }
        return (
          <ProjectLink
            href={`/profiles/${session.profileId}`}
            className="font-mono text-sm font-medium"
          >
            {session.profileId}
          </ProjectLink>
        );
      },
    },
    {
      accessorKey: 'entryPath',
      header: 'Entry Page',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="min-w-0">
            <span className="truncate font-mono text-sm">
              {session.entryPath || '/'}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'exitPath',
      header: 'Exit Page',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="min-w-0">
            <span className="truncate font-mono text-sm">
              {session.exitPath || session.entryPath || '/'}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'duration',
      header: 'Duration',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="font-medium">{formatDuration(session.duration)}</div>
        );
      },
    },
    {
      accessorKey: 'isBounce',
      header: 'Bounce',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="text-center">
            {session.isBounce ? (
              <span className="text-orange-600">Yes</span>
            ) : (
              <span className="text-green-600">No</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'referrerName',
      header: 'Referrer',
      cell: ({ row }) => {
        const session = row.original;
        const ref = session.referrerName || session.referrer || 'Direct';
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
      header: 'Location',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={session.country} />
            <span className="truncate">{session.city || session.country}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={session.os} />
            <span className="truncate">{session.os}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'browser',
      header: 'Browser',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={session.browser} />
            <span className="truncate">{session.browser}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'device',
      header: 'Device',
      cell: ({ row }) => {
        const session = row.original;
        let deviceInfo =
          session.brand || session.model
            ? [session.brand, session.model].filter(Boolean).join(' / ')
            : session.device;
        if (deviceInfo === 'K') {
          deviceInfo = session.device;
        }
        return (
          <div className="flex min-w-0 items-center gap-2">
            <SerieIcon name={session.device} />
            <span className="truncate">{deviceInfo}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'screenViewCount',
      header: 'Page views',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="text-center font-medium">
            {session.screenViewCount}
          </div>
        );
      },
    },
    {
      accessorKey: 'eventCount',
      header: 'Events',
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="text-center font-medium">{session.eventCount}</div>
        );
      },
    },
    {
      accessorKey: 'revenue',
      header: 'Revenue',
      cell: ({ row }) => {
        const session = row.original;
        return session.revenue > 0 ? (
          <div className="font-medium text-green-600">
            ${session.revenue.toFixed(2)}
          </div>
        ) : (
          <div className="text-muted-foreground">-</div>
        );
      },
    },
    {
      accessorKey: 'deviceId',
      header: 'Device ID',
    },
  ];

  return columns;
}
