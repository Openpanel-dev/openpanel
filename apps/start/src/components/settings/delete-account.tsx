import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';

export default function DeleteAccount() {
  const trpc = useTRPC();
  const { data: blockers = [] } = useQuery(
    trpc.user.deletionBlockers.queryOptions(),
  );

  const blocked = blockers.length > 0;

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">Delete account</span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>
          Deleting your account will permanently remove your personal data.
          Organizations you created that have no other admin will also be
          deleted, along with their projects and events.
        </p>
        {blocked && (
          <Alert variant="destructive">
            <AlertTitle>Cancel your subscriptions first</AlertTitle>
            <AlertDescription>
              These organizations you created have an active subscription. Cancel
              each one before deleting your account:
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
            Delete account
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
