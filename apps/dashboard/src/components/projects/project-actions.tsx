'use client';

import { api } from '@/app/_trpc/client';
import { pushModal, showConfirm } from '@/modals';
import { clipboard } from '@/utils/clipboard';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceProject } from '@openpanel/db';

import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export function ProjectActions(project: Exclude<IServiceProject, null>) {
  const { id } = project;
  const router = useRouter();
  const deletion = api.project.remove.useMutation({
    onSuccess() {
      toast('Success', {
        description: 'Project deleted successfully.',
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
          Copy project ID
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            pushModal('EditProject', project);
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
