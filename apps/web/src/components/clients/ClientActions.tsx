'use client';

import { api } from '@/app/_trpc/client';
import { pushModal, showConfirm } from '@/modals';
import { clipboard } from '@/utils/clipboard';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceClientWithProject } from '@mixan/db';

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
  const deletion = api.client.remove.useMutation({
    onSuccess() {
      toast('Success', {
        description: 'Client revoked, incoming requests will be rejected.',
      });
      router.refresh();
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
