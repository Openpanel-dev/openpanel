import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import type { IServiceProjectWithClients } from '@openpanel/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, format, startOfHour } from 'date-fns';
import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type Props = { project: IServiceProjectWithClients };

export default function DeleteProject({ project }: Props) {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const queryClient = useQueryClient();
  const { data: organization } = useQuery(
    trpc.organization.get.queryOptions({
      organizationId: project.organizationId,
    }),
  );
  // When the whole organization is scheduled for deletion, this project's
  // deletion is part of it and can only be cancelled at the organization level.
  const isOrgScheduledForDeletion = !!organization?.deleteAt;
  const mutation = useMutation(
    trpc.project.delete.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success(t('settings.delete_project_scheduled_toast'));
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
        toast.success(t('settings.delete_project_cancelled_toast'));
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
        <span className="title">{t('settings.delete_project_title')}</span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>{t('settings.delete_project_description')}</p>
        {project?.deleteAt && (
          <Alert variant="destructive">
            <AlertTitle>
              {t('settings.delete_project_scheduled_title')}
            </AlertTitle>
            <AlertDescription>
              {t('settings.delete_project_scheduled_prefix')}{' '}
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
              . {t('settings.delete_project_scheduled_suffix')}
              {isOrgScheduledForDeletion && (
                <>
                  {' '}
                  {t('settings.delete_project_org_scheduled_notice')}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-4 justify-start">
          {project?.deleteAt && (
            <Button
              variant="outline"
              disabled={isOrgScheduledForDeletion}
              onClick={() => {
                cancelDeletionMutation.mutate({ projectId: project.id });
              }}
              loading={cancelDeletionMutation.isPending}
            >
              {t('settings.delete_project_cancel_button')}
            </Button>
          )}
          <Button
            disabled={!!project?.deleteAt}
            variant="destructive"
            icon={TrashIcon}
            loading={mutation.isPending}
            onClick={() => {
              showConfirm({
                title: t('settings.delete_project_title'),
                text: t('settings.delete_project_confirm_text'),
                onConfirm: () => {
                  mutation.mutate({ projectId: project.id });
                },
              });
            }}
          >
            {t('settings.delete_project_title')}
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
