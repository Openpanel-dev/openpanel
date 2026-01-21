import FullPageLoadingState from '@/components/full-page-loading-state';
import { PublicPageCard } from '@/components/public-page-card';
import { Button, LinkButton } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { emailCategories } from '@openpanel/constants';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

const unsubscribeSearchSchema = z.object({
  email: z.string().email(),
  category: z.string(),
  token: z.string(),
});

export const Route = createFileRoute('/unsubscribe')({
  component: RouteComponent,
  validateSearch: unsubscribeSearchSchema,
  pendingComponent: FullPageLoadingState,
});

function RouteComponent() {
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
    }),
  );

  const handleUnsubscribe = () => {
    setIsUnsubscribing(true);
    setError(null);
    unsubscribeMutation.mutate({ email, category, token });
  };

  const categoryName =
    emailCategories[category as keyof typeof emailCategories] || category;

  if (isSuccess) {
    return (
      <PublicPageCard
        title="Unsubscribed"
        description={`You've been unsubscribed from ${categoryName} emails. You won't receive any more ${categoryName.toLowerCase()} emails from
          us.`}
      />
    );
  }

  return (
    <PublicPageCard
      title="Unsubscribe"
      description={
        <>
          Unsubscribe from {categoryName} emails? You'll stop receiving{' '}
          {categoryName.toLowerCase()} emails sent to&nbsp;
          <span className="">{email}</span>
        </>
      }
    >
      <div className="col gap-3">
        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}
        <Button onClick={handleUnsubscribe} disabled={isUnsubscribing}>
          {isUnsubscribing ? 'Unsubscribing...' : 'Confirm Unsubscribe'}
        </Button>
        <LinkButton href="/" variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </PublicPageCard>
  );
}
