import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import type { IServiceProjectWithClients } from '@openpanel/db';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { addHours, format, startOfHour } from 'date-fns';
import { TrashIcon } from 'lucide-react';
import { toast } from 'sonner';

type Props = { project: IServiceProjectWithClients };

export default function DeleteProject({ project }: Props) {
  const router = useRouter();
  const trpc = useTRPC();

  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.delete.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project is scheduled for deletion');
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          }),
        );
      },
    }),
  );

  const cancelDeletionMutation = useMutation(
    trpc.project.cancelDeletion.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project deletion cancelled');
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          }),
        );
      },
    }),
  );

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">Delete Project</span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
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
        <div className="flex gap-4 justify-start">
          {project?.deleteAt && (
            <Button
              variant="outline"
              onClick={() => {
                cancelDeletionMutation.mutate({ projectId: project.id });
              }}
              loading={cancelDeletionMutation.isPending}
            >
              Cancel deletion
            </Button>
          )}
          <Button
            disabled={!!project?.deleteAt}
            variant="destructive"
            icon={TrashIcon}
            loading={mutation.isPending}
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
