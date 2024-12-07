'use client';

import { ClientsTable } from '@/components/clients/table';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { pushModal } from '@/modals';
import type {
  IServiceClientWithProject,
  IServiceProjectWithClients,
} from '@openpanel/db';
import { PlusIcon } from 'lucide-react';
import { omit } from 'ramda';

type Props = { project: IServiceProjectWithClients };

export default function ProjectClients({ project }: Props) {
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
        <ClientsTable
          // @ts-expect-error
          query={{
            data: project.clients.map((item) => ({
              ...item,
              project: omit(['clients'], item),
            })) as unknown as IServiceClientWithProject[],
            isFetching: false,
            isLoading: false,
          }}
        />
      </WidgetBody>
    </Widget>
  );
}
