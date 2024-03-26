'use client';

import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { columns } from '@/components/clients/table';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import type { getClientsByOrganizationId } from '@openpanel/db';

interface ListClientsProps {
  clients: Awaited<ReturnType<typeof getClientsByOrganizationId>>;
}
export default function ListClients({ clients }: ListClientsProps) {
  return (
    <>
      <StickyBelowHeader>
        <div className="flex items-center justify-between p-4">
          <div />
          <Button icon={PlusIcon} onClick={() => pushModal('AddClient')}>
            <span className="max-sm:hidden">Create client</span>
            <span className="sm:hidden">Client</span>
          </Button>
        </div>
      </StickyBelowHeader>
      <div className="p-4">
        <DataTable data={clients} columns={columns} />
      </div>
    </>
  );
}
