import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function DeleteAccount() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { data: blockers = [] } = useQuery(
    trpc.user.deletionBlockers.queryOptions(),
  );

  const blocked = blockers.length > 0;

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">{t('settings.delete_account_title')}</span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>{t('settings.delete_account_description')}</p>
        {blocked && (
          <Alert variant="destructive">
            <AlertTitle>
              {t('settings.delete_account_subscription_block_title')}
            </AlertTitle>
            <AlertDescription>
              {t('settings.delete_account_subscription_block_description')}
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
        <div className="flex gap-4 justify-start">
          <Button
            disabled={blocked}
            icon={TrashIcon}
            onClick={() => {
              pushModal('ConfirmDeleteAccount');
            }}
            variant="destructive"
          >
            {t('settings.delete_account_title')}
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
