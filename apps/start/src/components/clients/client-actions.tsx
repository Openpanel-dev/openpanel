import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';

import { clipboard } from '@/utils/clipboard';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { MoreHorizontalIcon } from 'lucide-react';
import { toast } from 'sonner';

import type { IServiceClientWithProject } from '@openpanel/db';

import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export function ClientActions(client: IServiceClientWithProject) {
  const { id } = client;
  const router = useRouter();
  const trpc = useTRPC();
  const deletion = useMutation(
    trpc.client.remove.mutationOptions({
      onSuccess() {
        toast('Success', {
          description: 'Client revoked, incoming requests will be rejected.',
        });
        router.refresh();
      },
      onError: handleError,
    }),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => clipboard(id)}>
          Copy client ID
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            pushModal('EditClient', client);
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            showConfirm({
              title: 'Revoke client',
              text: 'Are you sure you want to revoke this client? This action cannot be undone.',
              onConfirm() {
                deletion.mutate({
                  id,
                });
              },
            });
          }}
        >
          Revoke
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
