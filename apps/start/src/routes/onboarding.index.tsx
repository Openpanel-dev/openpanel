import { Or } from '@/components/auth/or';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { SignUpEmailForm } from '@/components/auth/sign-up-email-form';
import FullPageLoadingState from '@/components/full-page-loading-state';
import {
  OnboardingDescription,
  OnboardingLayout,
} from '@/components/onboarding/onboarding-layout';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

const validateSearch = z.object({
  inviteId: z.string().optional(),
});
export const Route = createFileRoute('/onboarding/')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      context.trpc.auth.session.queryOptions(undefined, {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      }),
    );

    if (session) {
      throw redirect({ to: '/' });
    }
  },
  component: Component,
  validateSearch,
  loader: async ({ context, location }) => {
    const search = validateSearch.safeParse(location.search);
    if (search.success && search.data.inviteId) {
      await context.queryClient.prefetchQuery(
        context.trpc.organization.getInvite.queryOptions({
          inviteId: search.data.inviteId,
        }),
      );
    }
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { inviteId } = Route.useSearch();
  const trpc = useTRPC();
  const { data: invite } = useQuery(
    trpc.organization.getInvite.queryOptions(
      {
        inviteId: inviteId,
      },
      {
        enabled: !!inviteId,
      },
    ),
  );
  return (
    <div>
      <OnboardingLayout
        className="max-w-screen-sm"
        title="Create an account"
        description={
          <OnboardingDescription>
            Lets start with creating you account. By creating an account you
            accept the{' '}
            <a
              target="_blank"
              href="https://openpanel.dev/terms"
              rel="noreferrer"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              target="_blank"
              href="https://openpanel.dev/privacy"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </OnboardingDescription>
        }
      >
        {invite && !invite.isExpired && (
          <div className="card p-8 mb-8 col gap-2">
            <h2 className="text-2xl font-medium">
              Invitation to {invite.organization?.name}
            </h2>
            <p>
              After you have created your account, you will be added to the
              organization.
            </p>
          </div>
        )}
        {invite?.isExpired && (
          <div className="card p-8 mb-8 col gap-2">
            <h2 className="text-2xl font-medium">
              Invitation to {invite.organization?.name} has expired
            </h2>
            <p>
              The invitation has expired. Please contact the organization owner
              to get a new invitation.
            </p>
          </div>
        )}
        <div className="col md:row gap-4">
          <SignInGithub type="sign-up" inviteId={inviteId} />
          <SignInGoogle type="sign-up" inviteId={inviteId} />
        </div>
        <Or className="my-8" />
        <div className="col gap-8 p-8 card">
          <h2 className="text-2xl font-medium">Sign up with email</h2>
          <SignUpEmailForm inviteId={inviteId} />
        </div>
      </OnboardingLayout>
    </div>
  );
}
