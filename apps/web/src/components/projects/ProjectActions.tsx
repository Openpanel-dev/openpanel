import { useRefetchActive } from '@/hooks/useRefetchActive';
import { pushModal, showConfirm } from '@/modals';
import type { IProject } from '@/types';
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

export function ProjectActions({ id }: IProject) {
  const refetch = useRefetchActive();
  const deletion = api.project.remove.useMutation({
    onSuccess() {
      toast({
        title: 'Success',
        description: 'Project deleted successfully.',
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
          Copy project ID
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            pushModal('EditProject', { id });
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            showConfirm({
              title: 'Delete project',
              text: 'This will delete all events for this project. This action cannot be undone.',
              onConfirm() {
                deletion.mutate({
                  id,
                });
              },
            });
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
