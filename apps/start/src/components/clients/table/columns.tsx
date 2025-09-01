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

import { ACTIONS } from '@/components/data-table';
import type { IServiceClientWithProject, IServiceEvent } from '@openpanel/db';
import { ClientActions } from '../client-actions';

export function useColumns() {
  const number = useNumber();
  const columns: ColumnDef<IServiceClientWithProject>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        return <div className="font-medium">{row.original.name}</div>;
      },
    },
    {
      accessorKey: 'id',
      header: 'Client ID',
      cell: ({ row }) => <div className="font-mono">{row.original.id}</div>,
    },
    // {
    //   accessorKey: 'secret',
    //   header: 'Secret',
    //   cell: (info) =>
    //       <div className="italic text-muted-foreground"></div>

    // },
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
    {
      id: ACTIONS,
      header: 'Actions',
      cell: ({ row }) => <ClientActions {...row.original} />,
    },
  ];

  return columns;
}
