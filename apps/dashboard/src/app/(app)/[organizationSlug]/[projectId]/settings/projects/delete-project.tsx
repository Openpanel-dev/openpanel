'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { showConfirm } from '@/modals';
import { api, handleError } from '@/trpc/client';
import type { IServiceProjectWithClients } from '@openpanel/db';
import { useQueryClient } from '@tanstack/react-query';
import { router } from '@trpc/server';
import { addHours, format, startOfHour } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Props = { project: IServiceProjectWithClients };

export default function DeleteProject({ project }: Props) {
  const router = useRouter();
  const mutation = api.project.delete.useMutation({
    onError: handleError,
    onSuccess: () => {
      toast.success('Project updated');
      router.refresh();
    },
  });
  const cancelDeletionMutation = api.project.cancelDeletion.useMutation({
    onError: handleError,
    onSuccess: () => {
      toast.success('Project updated');
      router.refresh();
    },
  });

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">Delete Project</span>
      </WidgetHead>
      <WidgetBody className="col gap-4">
        <p>
          Deleting your project will remove it from your organization and all of
          its data. It'll be permanently deleted after 24 hours.
        </p>
        {project?.deleteAt && (
          <Alert variant="destructive">
            <AlertTitle>Project scheduled for deletion</AlertTitle>
            <AlertDescription>
              This project will be deleted on{' '}
              <span className="font-medium">
                {
                  // add 1 hour and round to the nearest hour
                  // Since we run cron once an hour
                  format(
                    startOfHour(addHours(project.deleteAt, 1)),
                    'yyyy-MM-dd HH:mm:ss',
                  )
                }
              </span>
              . Any event associated with this project will be deleted.
            </AlertDescription>
          </Alert>
        )}
        <div className="row gap-4 justify-end">
          {project?.deleteAt && (
            <Button
              variant="outline"
              onClick={() => {
                cancelDeletionMutation.mutate({ projectId: project.id });
              }}
            >
              Cancel deletion
            </Button>
          )}
          <Button
            disabled={!!project?.deleteAt}
            variant="destructive"
            onClick={() => {
              showConfirm({
                title: 'Delete Project',
                text: 'Are you sure you want to delete this project?',
                onConfirm: () => {
                  mutation.mutate({ projectId: project.id });
                },
              });
            }}
          >
            Delete Project
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
