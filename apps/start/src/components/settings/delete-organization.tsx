import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { IServiceOrganization } from '@openpanel/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, format, startOfHour } from 'date-fns';
import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type Props = { organization: IServiceOrganization };

export default function DeleteOrganization({ organization }: Props) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: myAccess } = useQuery(
    trpc.organization.myAccess.queryOptions({
      organizationId: organization.id,
    }),
  );

  const cancelDeletionMutation = useMutation(
    trpc.organization.cancelDeletion.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success(t('settings.delete_organization_cancelled_toast'));
        queryClient.invalidateQueries(
          trpc.organization.get.queryFilter({
            organizationId: organization.id,
          }),
        );
      },
    }),
  );

  // Only admins can delete the organization. The server enforces this too.
  if (myAccess?.role !== 'org:admin') {
    return null;
  }

  // Block deletion while a paid subscription is still active and not cancelled.
  const blockDeletion =
    organization.hasSubscription && !organization.isWillBeCanceled;

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">
          {t('settings.delete_organization_title')}
        </span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>{t('settings.delete_organization_description')}</p>
        {organization.deleteAt && (
          <Alert variant="destructive">
            <AlertTitle>
              {t('settings.delete_organization_scheduled_title')}
            </AlertTitle>
            <AlertDescription>
              {t('settings.delete_organization_scheduled_prefix')}{' '}
              <span className="font-medium">
                {format(
                  startOfHour(addHours(organization.deleteAt, 1)),
                  'yyyy-MM-dd HH:mm:ss',
                )}
              </span>
              . {t('settings.delete_organization_scheduled_suffix')}
            </AlertDescription>
          </Alert>
        )}
        {blockDeletion && !organization.deleteAt && (
          <Alert variant="destructive">
            <AlertTitle>
              {t('settings.delete_organization_subscription_block_title')}
            </AlertTitle>
            <AlertDescription>
              {t('settings.delete_organization_subscription_block_description')}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-4 justify-start">
          {organization.deleteAt && (
            <Button
              loading={cancelDeletionMutation.isPending}
              onClick={() => {
                cancelDeletionMutation.mutate({
                  organizationId: organization.id,
                });
              }}
              variant="outline"
            >
              {t('settings.delete_project_cancel_button')}
            </Button>
          )}
          <Button
            disabled={blockDeletion || !!organization.deleteAt}
            icon={TrashIcon}
            onClick={() => {
              pushModal('ConfirmDeleteOrganization', {
                organizationId: organization.id,
                organizationName: organization.name,
              });
            }}
            variant="destructive"
          >
            {t('settings.delete_organization_title')}
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
