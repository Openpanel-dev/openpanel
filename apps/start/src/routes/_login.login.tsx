import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { Or } from '@/components/auth/or';
import { SignInEmailForm } from '@/components/auth/sign-in-email-form';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCookieStore } from '@/hooks/use-cookie-store';
import { useTRPC } from '@/integrations/trpc/react';
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
    const [, isRegistrationAllowed] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.auth.providers.queryOptions()
      ),
      context.queryClient.ensureQueryData(
        context.trpc.auth.isRegistrationAllowed.queryOptions({})
      ),
    ]);
    return isRegistrationAllowed;
  },
});

function LoginPage() {
  const { error, correlationId, inviteId } = Route.useSearch();
  const trpc = useTRPC();
  const { data: providers } = useSuspenseQuery(
    trpc.auth.providers.queryOptions()
  );
  const hasOAuthProviders = providers.google || providers.github;
  const isRegistrationAllowed = Route.useLoaderData();
  const [lastProvider] = useCookieStore<null | string>(
    'last-auth-provider',
    null
  );

  return (
    <div className="col w-full gap-8 text-left">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">Sign in</h1>
        {isRegistrationAllowed && (
          <p className="text-muted-foreground">
            Don't have an account?{' '}
            <a
              className="font-medium text-foreground underline"
              href="/onboarding"
            >
              Create one today
            </a>
          </p>
        )}
      </div>
      {error && (
        <Alert
          className="mb-6 border-destructive/20 bg-destructive/10 text-left"
          variant="destructive"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {correlationId && (
              <>
                <p>Correlation ID: {correlationId}</p>
                <p className="mt-2">
                  Contact us if you have any issues.{' '}
                  <a
                    className="font-medium underline"
                    href={`mailto:hello@openpanel.dev?subject=Login%20Issue%20-%20Correlation%20ID%3A%20${correlationId}`}
                  >
                    hello[at]openpanel.dev
                  </a>
                </p>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {hasOAuthProviders && (
        <>
          <div className="space-y-4">
            {providers.google && (
              <SignInGoogle
                inviteId={inviteId}
                isLastUsed={lastProvider === 'google'}
                type="sign-in"
              />
            )}
            {providers.github && (
              <SignInGithub
                inviteId={inviteId}
                isLastUsed={lastProvider === 'github'}
                type="sign-in"
              />
            )}
          </div>
          <Or />
        </>
      )}
      <SignInEmailForm inviteId={inviteId} isLastUsed={lastProvider === 'email'} />
    </div>
  );
}
