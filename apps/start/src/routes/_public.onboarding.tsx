import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { z } from 'zod';
import { Or } from '@/components/auth/or';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { SignUpEmailForm } from '@/components/auth/sign-up-email-form';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { useTRPC } from '@/integrations/trpc/react';
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
  beforeLoad: async ({ context }) => {
    if (context.session?.session) {
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
        })
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
        inviteId,
      },
      {
        enabled: !!inviteId,
      }
    )
  );
  return (
    <div className="col w-full gap-8 text-left">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">
          Start tracking in minutes
        </h1>
        <p className="text-muted-foreground">
          Join 1,000+ projects already using OpenPanel. By creating an account
          you accept the{' '}
          <a
            className="underline transition-colors hover:text-foreground"
            href="https://openpanel.dev/terms"
            rel="noreferrer"
            target="_blank"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            className="underline transition-colors hover:text-foreground"
            href="https://openpanel.dev/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>

      {invite && !invite.isExpired && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-2 font-semibold text-xl">
            Invitation to {invite.organization?.name}
          </h2>
          <p className="text-muted-foreground">
            After you have created your account, you will be added to the
            organization.
          </p>
        </div>
      )}
      {invite?.isExpired && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-6">
          <h2 className="mb-2 font-semibold text-destructive text-xl">
            Invitation to {invite.organization?.name} has expired
          </h2>
          <p className="text-muted-foreground">
            The invitation has expired. Please contact the organization owner to
            get a new invitation.
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SignInGithub inviteId={inviteId} type="sign-up" />
          <SignInGoogle inviteId={inviteId} type="sign-up" />
        </div>
        <p className="text-center text-muted-foreground text-xs">
          No credit card required · Free 30-day trial · Cancel anytime
        </p>

        <Or className="my-6" />

        <div className="mb-4 flex items-center gap-2 font-semibold text-lg">
          <MailIcon className="size-4" />
          Sign up with email
        </div>
        <SignUpEmailForm inviteId={inviteId} />
      </div>
    </div>
  );
}
