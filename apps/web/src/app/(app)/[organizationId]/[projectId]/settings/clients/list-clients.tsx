'use client';

import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { columns } from '@/components/clients/table';
import { DataTable } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import type { getClientsByOrganizationId } from '@mixan/db';

interface ListClientsProps {
  clients: Awaited<ReturnType<typeof getClientsByOrganizationId>>;
}
export default function ListClients({ clients }: ListClientsProps) {
  const organizationId = useAppParams().organizationId;

  return (
    <>
      <StickyBelowHeader>
        <div className="p-4 flex items-center justify-between">
          <div />
          <Button
            icon={PlusIcon}
            onClick={() => pushModal('AddClient', { organizationId })}
          >
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
