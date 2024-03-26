'use client';

import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { DataTable } from '@/components/data-table';
import { columns } from '@/components/references/table';
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import type { IServiceReference } from '@openpanel/db';

interface ListProjectsProps {
  data: IServiceReference[];
}

export default function ListReferences({ data }: ListProjectsProps) {
  return (
    <>
      <StickyBelowHeader>
        <div className="flex items-center justify-between p-4">
          <div />
          <Button icon={PlusIcon} onClick={() => pushModal('AddReference')}>
            <span className="max-sm:hidden">Create reference</span>
            <span className="sm:hidden">Reference</span>
          </Button>
        </div>
      </StickyBelowHeader>
      <div className="p-4">
        <DataTable data={data} columns={columns} />
      </div>
    </>
  );
}
