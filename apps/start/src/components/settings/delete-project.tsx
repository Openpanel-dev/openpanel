import type { IServiceProjectWithClients } from '@openpanel/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { addHours, format, startOfHour } from 'date-fns';
import { TrashIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';

type Props = { project: IServiceProjectWithClients };

export default function DeleteProject({ project }: Props) {
  const router = useRouter();
  const trpc = useTRPC();

  const queryClient = useQueryClient();
  const { data: organization } = useQuery(
    trpc.organization.get.queryOptions({
      organizationId: project.organizationId,
    })
  );
  // When the whole organization is scheduled for deletion, this project's
  // deletion is part of it and can only be cancelled at the organization level.
  const isOrgScheduledForDeletion = !!organization?.deleteAt;
  const mutation = useMutation(
    trpc.project.delete.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project is scheduled for deletion');
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          })
        );
      },
    })
  );

  const cancelDeletionMutation = useMutation(
    trpc.project.cancelDeletion.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Project deletion cancelled');
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          })
        );
      },
    })
  );

  return (
    <Widget className="w-full max-w-screen-md">
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
                    'yyyy-MM-dd HH:mm:ss'
                  )
                }
              </span>
              . Any event associated with this project will be deleted.
              {isOrgScheduledForDeletion && (
                <>
                  {' '}
                  The whole organization is scheduled for deletion. To keep this
                  project, cancel the deletion from the organization settings.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-start gap-4">
          {project?.deleteAt && (
            <Button
              disabled={isOrgScheduledForDeletion}
              loading={cancelDeletionMutation.isPending}
              onClick={() => {
                cancelDeletionMutation.mutate({ projectId: project.id });
              }}
              variant="outline"
            >
              Cancel deletion
            </Button>
          )}
          <Button
            disabled={!!project?.deleteAt}
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
            variant="destructive"
          >
            Delete Project
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
