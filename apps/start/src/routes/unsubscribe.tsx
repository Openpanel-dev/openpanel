import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LoginNavbar } from '@/components/login-navbar';
import { useTRPC } from '@/integrations/trpc/react';
import { emailCategories } from '@openpanel/constants';
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

  const unsubscribeMutation = trpc.email.unsubscribe.useMutation({
    onSuccess: () => {
      setIsSuccess(true);
      setIsUnsubscribing(false);
    },
    onError: (err) => {
      setError(err.message || 'Failed to unsubscribe');
      setIsUnsubscribing(false);
    },
  });

  const handleUnsubscribe = () => {
    setIsUnsubscribing(true);
    setError(null);
    unsubscribeMutation.mutate({ email, category, token });
  };

  const categoryName =
    emailCategories[category as keyof typeof emailCategories] || category;

  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col">
        <LoginNavbar />
        <div className="flex-1 center-center px-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-6xl mb-4">✓</div>
            <h1 className="text-2xl font-bold">Unsubscribed</h1>
            <p className="text-muted-foreground">
              You've been unsubscribed from {categoryName} emails.
            </p>
            <p className="text-sm text-muted-foreground">
              You won't receive any more {categoryName.toLowerCase()} emails from
              us.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <LoginNavbar />
      <div className="flex-1 center-center px-4">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Unsubscribe</h1>
            <p className="text-muted-foreground">
              Unsubscribe from {categoryName} emails?
            </p>
            <p className="text-sm text-muted-foreground">
              You'll stop receiving {categoryName.toLowerCase()} emails sent to{' '}
              <span className="font-mono text-xs">{email}</span>
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleUnsubscribe}
              disabled={isUnsubscribing}
              className="w-full bg-black text-white py-3 px-4 rounded-md font-medium hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUnsubscribing ? 'Unsubscribing...' : 'Confirm Unsubscribe'}
            </button>
            <a
              href="/"
              className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
