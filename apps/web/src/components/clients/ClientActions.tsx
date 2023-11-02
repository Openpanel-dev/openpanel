import { useRefetchActive } from '@/hooks/useRefetchActive';
import { pushModal, showConfirm } from '@/modals';
import type { IClientWithProject } from '@/types';
import { api } from '@/utils/api';
import { clipboard } from '@/utils/clipboard';
import { MoreHorizontal } from 'lucide-react';

import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { toast } from '../ui/use-toast';

export function ClientActions({ id }: IClientWithProject) {
  const refetch = useRefetchActive();
  const deletion = api.client.remove.useMutation({
    onSuccess() {
      toast({
        title: 'Success',
        description: 'Client revoked, incoming requests will be rejected.',
      });
      refetch();
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => clipboard(id)}>
          Copy client ID
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            pushModal('EditClient', { id });
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
