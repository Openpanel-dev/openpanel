import { DataTable } from '@/components/data-table';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { GanttChartIcon } from 'lucide-react';

import type { RouterOutputs } from '@/trpc/client';

import { useColumns } from './columns';
type CommonProps = {
  data?: RouterOutputs['organization']['invitations'];
};

type Props = CommonProps;

export const InvitesTable = ({ data }: Props) => {
  const columns = useColumns();

  if (!data) {
    return (
      <div className="flex flex-col gap-2">
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4" />
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4" />
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4" />
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4" />
        <div className="card h-[74px] w-full animate-pulse items-center justify-between rounded-lg p-4" />
      </div>
    );
  }

  if (data?.length === 0) {
    return (
      <FullPageEmptyState title="No members here" icon={GanttChartIcon}>
        <p>Could not find any members</p>
      </FullPageEmptyState>
    );
  }

  return (
    <>
      <DataTable data={data ?? []} columns={columns} />
    </>
  );
};
