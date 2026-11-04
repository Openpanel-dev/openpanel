import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AlertCircleIcon, MailOpenIcon } from 'lucide-react';
import { useEffect } from 'react';
import { z } from 'zod';
import { AuthHeading } from '@/components/auth/auth-shell';
import { Or } from '@/components/auth/or';
import { SignInOAuth } from '@/components/auth/sign-in-oauth';
import { SignUpEmailForm } from '@/components/auth/sign-up-email-form';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { useAppContext } from '@/hooks/use-app-context';
import { useTRPC } from '@/integrations/trpc/react';
import { trackFunnel } from '@/utils/funnel-tracking';
import { isSignedIn } from '@/utils/route-session';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

const validateSearch = z.object({
  inviteId: z.string().optional(),
});
export const Route = createFileRoute('/_public/onboarding')({
  head: () => ({
    meta: [
      { title: createEntityTitle('Create an account', PAGE_TITLES.ONBOARDING) },
      { name: 'robots', content: 'noindex, follow' },
    ],
  }),
  beforeLoad: async ({ context, search }) => {
    if (!(await isSignedIn(context))) {
      return;
    }
    // A signed-in user opening an invite link accepts it explicitly there.
    if (search.inviteId) {
      throw redirect({
        to: '/invite/$inviteId',
        params: { inviteId: search.inviteId },
      });
    }
    throw redirect({ to: '/' });
  },
  component: Component,
  validateSearch,
  loader: async ({ context, location }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.auth.providers.queryOptions()
    );
    const search = validateSearch.safeParse(location.search);
    if (search.success && search.data.inviteId) {
      await context.queryClient.prefetchQuery(
        context.trpc.organization.getInvite.queryOptions({
          inviteId: search.data.inviteId,
        })
      );
    }
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { inviteId } = Route.useSearch();
  const { isSelfHosted } = useAppContext();
  const trpc = useTRPC();
  const { data: providers } = useSuspenseQuery(
    trpc.auth.providers.queryOptions()
  );
  const hasOAuthProviders = providers.google || providers.github;
  const { data: invite } = useQuery(
    trpc.organization.getInvite.queryOptions(
      {
        inviteId,
      },
      {
        enabled: !!inviteId,
      }
    )
  );
  useEffect(() => {
    trackFunnel('auth_page_viewed', {
      page: 'signup',
      hasInvite: Boolean(inviteId),
      inviteExpired: invite?.isExpired ?? null,
      google: providers.google,
      github: providers.github,
    });
  }, [inviteId, invite?.isExpired, providers.google, providers.github]);

  const signInHref = inviteId
    ? `/login?inviteId=${encodeURIComponent(inviteId)}`
    : '/login';
  const description = isSelfHosted
    ? 'Set up your account on this OpenPanel instance.'
    : 'Start your 30-day free trial. No credit card required.';

  return (
    <div className="col w-full gap-8">
      <AuthHeading description={description} title="Create your account" />

      {invite && !invite.isExpired && (
        <div className="row items-start gap-3 rounded-xl bg-def-200 p-4">
          <MailOpenIcon className="mt-0.5 shrink-0 text-highlight" size={18} />
          <div className="col gap-0.5">
            <div className="font-medium">
              You are invited to {invite.organization?.name}
            </div>
            <p className="text-muted-foreground text-sm">
              Create your account and you will join the workspace right away.
            </p>
          </div>
        </div>
      )}
      {invite?.isExpired && (
        <div className="row items-start gap-3 rounded-xl bg-destructive/10 p-4">
          <AlertCircleIcon
            className="mt-0.5 shrink-0 text-destructive"
            size={18}
          />
          <div className="col gap-0.5">
            <div className="font-medium">
              The invitation to {invite.organization?.name} has expired
            </div>
            <p className="text-muted-foreground text-sm">
              Ask the workspace owner for a new one. You can still create an
              account now and join later.
            </p>
          </div>
        </div>
      )}

      {hasOAuthProviders && (
        <>
          <div className="col gap-3">
            {providers.google && (
              <SignInOAuth
                inviteId={inviteId}
                provider="google"
                type="sign-up"
              />
            )}
            {providers.github && (
              <SignInOAuth
                inviteId={inviteId}
                provider="github"
                type="sign-up"
              />
            )}
          </div>
          <Or>or sign up with email</Or>
        </>
      )}

      <SignUpEmailForm inviteId={inviteId} />

      <p className="text-center text-muted-foreground text-xs leading-relaxed">
        By creating an account you agree to the{' '}
        <a
          className="underline hover:text-foreground"
          href="https://openpanel.dev/terms"
          rel="noreferrer"
          target="_blank"
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          className="underline hover:text-foreground"
          href="https://openpanel.dev/privacy"
          rel="noreferrer"
          target="_blank"
        >
          Privacy Policy
        </a>
        .
      </p>

      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{' '}
        <a className="font-medium text-foreground underline" href={signInHref}>
          Sign in
        </a>
      </p>
    </div>
  );
}
