'use client';

import { pushModal, showConfirm } from '@/modals';
import { api } from '@/trpc/client';
import { Edit2Icon, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceProject } from '@openpanel/db';

import { Button } from '../ui/button';

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
    <div className="flex gap-2">
      <Button
        variant="secondary"
        onClick={() => {
          pushModal('EditProject', project);
        }}
        icon={Edit2Icon}
      >
        Edit project
      </Button>
      <Button
        variant="secondary"
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
        icon={TrashIcon}
      >
        Delete project
      </Button>
    </div>
  );
}
