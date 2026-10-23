import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { z } from 'zod';
import { AuthHeading } from '@/components/auth/auth-shell';
import { Or } from '@/components/auth/or';
import { SignInDev } from '@/components/auth/sign-in-dev';
import { SignInEmailForm } from '@/components/auth/sign-in-email-form';
import { SignInOAuth } from '@/components/auth/sign-in-oauth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCookieStore } from '@/hooks/use-cookie-store';
import { useTRPC } from '@/integrations/trpc/react';
import { trackFunnel } from '@/utils/funnel-tracking';
import { createTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_login/login')({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: createTitle(PAGE_TITLES.LOGIN) },
      { name: 'robots', content: 'noindex, follow' },
    ],
  }),
  validateSearch: z.object({
    error: z.string().optional(),
    correlationId: z.string().optional(),
    inviteId: z.string().optional(),
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.auth.providers.queryOptions()
    );
  },
});

function LoginPage() {
  const { error, correlationId, inviteId } = Route.useSearch();
  const trpc = useTRPC();
  const { data: providers } = useSuspenseQuery(
    trpc.auth.providers.queryOptions()
  );
  const hasOAuthProviders = providers.google || providers.github;
  const [lastProvider] = useCookieStore<null | string>(
    'last-auth-provider',
    null
  );
  useEffect(() => {
    trackFunnel('auth_page_viewed', {
      page: 'login',
      hasInvite: Boolean(inviteId),
      hadError: Boolean(error),
      google: providers.google,
      github: providers.github,
      lastProvider,
    });
  }, [inviteId, error, providers.google, providers.github, lastProvider]);

  const signUpHref = inviteId
    ? `/onboarding?inviteId=${encodeURIComponent(inviteId)}`
    : '/onboarding';

  return (
    <div className="col w-full gap-8">
      <AuthHeading
        description="Sign in to your OpenPanel account."
        title="Welcome back"
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not sign you in</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {correlationId && (
              <p className="mt-2">
                Reference: {correlationId}.{' '}
                <a
                  className="font-medium underline"
                  href={`mailto:hello@openpanel.dev?subject=Login%20Issue%20-%20Correlation%20ID%3A%20${correlationId}`}
                >
                  Email us
                </a>{' '}
                and we will sort it out.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {hasOAuthProviders && (
        <>
          <div className="col gap-3">
            {providers.google && (
              <SignInOAuth
                inviteId={inviteId}
                isLastUsed={lastProvider === 'google'}
                provider="google"
                type="sign-in"
              />
            )}
            {providers.github && (
              <SignInOAuth
                inviteId={inviteId}
                isLastUsed={lastProvider === 'github'}
                provider="github"
                type="sign-in"
              />
            )}
          </div>
          <Or>or continue with email</Or>
        </>
      )}

      <SignInEmailForm
        inviteId={inviteId}
        isLastUsed={lastProvider === 'email'}
      />

      {providers.devLogin && (
        <>
          <Or>local development</Or>
          <SignInDev inviteId={inviteId} />
        </>
      )}

      <p className="text-center text-muted-foreground text-sm">
        New to OpenPanel?{' '}
        <a className="font-medium text-foreground underline" href={signUpHref}>
          Create an account
        </a>
      </p>
    </div>
  );
}
