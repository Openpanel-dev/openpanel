import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { TranslationText as DashboardText } from '@/i18n/provider';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

export default function DeleteAccount() {
  const trpc = useTRPC();
  const { data: blockers = [] } = useQuery(
    trpc.user.deletionBlockers.queryOptions()
  );

  const blocked = blockers.length > 0;

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <span className="title">
          <DashboardText i18nKey={'Delete account'} />
        </span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>
          <DashboardText
            i18nKey={
              'Deleting your account will permanently remove your personal data. Organizations you created that have no other admin will also be deleted, along with their projects and events.'
            }
          />{' '}
        </p>
        {blocked && (
          <Alert variant="destructive">
            <AlertTitle>
              <DashboardText i18nKey={'Cancel your subscriptions first'} />
            </AlertTitle>
            <AlertDescription>
              <DashboardText
                i18nKey={
                  'These organizations you created have an active subscription. Cancel each one before deleting your account:'
                }
              />{' '}
              <ul className="mt-2 list-disc pl-5">
                {blockers.map((organization) => (
                  <li key={organization.id}>
                    <Link
                      className="underline"
                      params={{ organizationId: organization.id }}
                      to="/$organizationId/billing"
                    >
                      {organization.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-start gap-4">
          <Button
            disabled={blocked}
            icon={TrashIcon}
            onClick={() => {
              pushModal('ConfirmDeleteAccount');
            }}
            variant="destructive"
          >
            <DashboardText i18nKey={'Delete account'} />{' '}
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
