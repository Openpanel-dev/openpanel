import type { IServiceOrganization } from '@openpanel/core';
import { isOrganizationAdminRole } from '@openpanel/core/modules/organization/organization.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHours, format, startOfHour } from 'date-fns';
import { TrashIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { TranslationText as DashboardText } from '@/i18n/provider';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

interface Props {
  organization: IServiceOrganization;
}

export default function DeleteOrganization({ organization }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: myAccess } = useQuery(
    trpc.organization.myAccess.queryOptions({
      organizationId: organization.id,
    })
  );

  const cancelDeletionMutation = useMutation(
    trpc.organization.cancelDeletion.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Organization deletion cancelled');
        queryClient.invalidateQueries(
          trpc.organization.get.queryFilter({
            organizationId: organization.id,
          })
        );
      },
    })
  );

  // Only admins can delete the organization. The server enforces this too.
  if (!(myAccess && isOrganizationAdminRole(myAccess.role))) {
    return null;
  }

  // Block deletion while a paid subscription is still active and not cancelled.
  const blockDeletion =
    organization.hasSubscription && !organization.isWillBeCanceled;

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <span className="title">
          <DashboardText i18nKey={'Delete Organization'} />
        </span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>
          <DashboardText
            i18nKey={
              'Deleting this organization will remove it and all of its projects and their data. It will be permanently deleted after 24 hours.'
            }
          />{' '}
        </p>
        {organization.deleteAt && (
          <Alert variant="destructive">
            <AlertTitle>
              <DashboardText i18nKey={'Organization scheduled for deletion'} />
            </AlertTitle>
            <AlertDescription>
              <DashboardText i18nKey={'This organization will be deleted on'} />{' '}
              <span className="font-medium">
                {format(
                  startOfHour(addHours(organization.deleteAt, 1)),
                  'yyyy-MM-dd HH:mm:ss'
                )}
              </span>
              . All of its projects and their events will be deleted.
            </AlertDescription>
          </Alert>
        )}
        {blockDeletion && !organization.deleteAt && (
          <Alert variant="destructive">
            <AlertTitle>
              <DashboardText i18nKey={'Cancel your subscription first'} />
            </AlertTitle>
            <AlertDescription>
              <DashboardText
                i18nKey={
                  'This organization has an active subscription. Cancel it from the billing settings before you delete the organization.'
                }
              />{' '}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-start gap-4">
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
              <DashboardText i18nKey={'Cancel deletion'} />{' '}
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
            <DashboardText i18nKey={'Delete Organization'} />{' '}
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
