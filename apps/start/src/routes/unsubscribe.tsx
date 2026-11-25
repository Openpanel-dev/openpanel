import { emailCategories } from '@openpanel/core/modules/email/email.constants';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { MailXIcon } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { EmptyState } from '@/components/empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PublicPageCard } from '@/components/public-page-card';
import { Button, LinkButton } from '@/components/ui/button';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { useTRPC } from '@/integrations/trpc/react';

const unsubscribeSearchSchema = z.object({
  email: z.string().email(),
  category: z.string(),
  token: z.string(),
});

export const Route = createFileRoute('/unsubscribe')({
  component: RouteComponent,
  validateSearch: unsubscribeSearchSchema,
  pendingComponent: FullPageLoadingState,
  // A missing or malformed parameter would otherwise show the raw ZodError.
  errorComponent: () => (
    <EmptyState
      description="This unsubscribe link is missing information or has expired. Open the link from your email again, or change your preferences from your account settings."
      icon={MailXIcon}
      title="Link not valid"
      variant="page"
    />
  ),
});

function RouteComponent() {
  const { t: translateUi } = useDashboardTranslation();

  const search = useSearch({ from: '/unsubscribe' });
  const { email, category, token } = search;
  const trpc = useTRPC();
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeMutation = useMutation(
    trpc.email.unsubscribe.mutationOptions({
      onSuccess: () => {
        setIsSuccess(true);
        setIsUnsubscribing(false);
      },
      onError: (err) => {
        setError(err.message || 'Failed to unsubscribe');
        setIsUnsubscribing(false);
      },
    })
  );

  const handleUnsubscribe = () => {
    setIsUnsubscribing(true);
    setError(null);
    unsubscribeMutation.mutate({ email, category, token });
  };

  const categoryName =
    emailCategories[category as keyof typeof emailCategories]?.label ??
    category;

  if (isSuccess) {
    return (
      <PublicPageCard
        description={`You've been unsubscribed from ${categoryName} emails. You won't receive any more ${categoryName.toLowerCase()} emails from
          us.`}
        title={translateUi('Unsubscribed')}
      />
    );
  }

  return (
    <PublicPageCard
      description={
        <>
          <DashboardText i18nKey={'Unsubscribe from'} /> {categoryName}{' '}
          <DashboardText i18nKey={"emails? You'll stop receiving"} />{' '}
          {categoryName.toLowerCase()}{' '}
          <DashboardText i18nKey={'emails sent to&nbsp;'} />{' '}
          <span className="">{email}</span>
        </>
      }
      title={translateUi('Unsubscribe')}
    >
      <div className="col gap-3">
        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-destructive text-sm">
            {error}
          </div>
        )}
        <Button disabled={isUnsubscribing} onClick={handleUnsubscribe}>
          {isUnsubscribing ? 'Unsubscribing...' : 'Confirm Unsubscribe'}
        </Button>
        <LinkButton href="/" variant="ghost">
          <DashboardText i18nKey={'Cancel'} />{' '}
        </LinkButton>
      </div>
    </PublicPageCard>
  );
}
