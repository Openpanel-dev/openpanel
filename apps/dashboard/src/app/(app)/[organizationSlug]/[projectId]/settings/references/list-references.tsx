'use client';

import { DataTable } from '@/components/data-table';
import { columns } from '@/components/references/table';
import { Button } from '@/components/ui/button';
import { Padding } from '@/components/ui/padding';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import type { IServiceReference } from '@openpanel/db';

interface ListProjectsProps {
  data: IServiceReference[];
}

export default function ListReferences({ data }: ListProjectsProps) {
  return (
    <Padding>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">References</h1>
        <Button icon={PlusIcon} onClick={() => pushModal('AddReference')}>
          <span className="max-sm:hidden">Create reference</span>
          <span className="sm:hidden">Reference</span>
        </Button>
      </div>
      <DataTable data={data} columns={columns} />
    </Padding>
  );
}
