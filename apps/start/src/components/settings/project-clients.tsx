'use client';

import { useColumns } from '@/components/clients/table/columns';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { PlusIcon } from 'lucide-react';

type Props = { project: RouterOutputs['project']['getProjectWithClients'] };

export default function ProjectClients({ project }: Props) {
  const columns = useColumns();

  return (
    <Widget className="max-w-screen-md w-full overflow-hidden">
      <WidgetHead className="flex items-center justify-between">
        <span className="title">Clients</span>
        <Button
          variant="outline"
          icon={PlusIcon}
          className="-my-1"
          onClick={() => pushModal('AddClient')}
        >
          New client
        </Button>
      </WidgetHead>
      <WidgetBody className="p-0 [&>div]:border-none [&>div]:rounded-none">
        <DataTable data={project.clients || []} columns={columns} />
      </WidgetBody>
    </Widget>
  );
}
