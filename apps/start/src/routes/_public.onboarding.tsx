import { Or } from '@/components/auth/or';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { SignUpEmailForm } from '@/components/auth/sign-up-email-form';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LogoSquare } from '@/components/logo';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { MailIcon } from 'lucide-react';
import { z } from 'zod';
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
    if (context.session.session) {
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
    <div className="col gap-8 w-full text-left">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Create an account
        </h1>
        <p className="text-muted-foreground">
          Let's start with creating your account. By creating an account you
          accept the{' '}
          <a
            target="_blank"
            href="https://openpanel.dev/terms"
            rel="noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            target="_blank"
            href="https://openpanel.dev/privacy"
            rel="noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>

      {invite && !invite.isExpired && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">
            Invitation to {invite.organization?.name}
          </h2>
          <p className="text-muted-foreground">
            After you have created your account, you will be added to the
            organization.
          </p>
        </div>
      )}
      {invite?.isExpired && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2 text-destructive">
            Invitation to {invite.organization?.name} has expired
          </h2>
          <p className="text-muted-foreground">
            The invitation has expired. Please contact the organization owner to
            get a new invitation.
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SignInGithub type="sign-up" inviteId={inviteId} />
          <SignInGoogle type="sign-up" inviteId={inviteId} />
        </div>

        <Or className="my-6" />

        <div className="flex items-center gap-2 font-semibold mb-4 text-lg">
          <MailIcon className="size-4" />
          Sign up with email
        </div>
        <SignUpEmailForm inviteId={inviteId} />
      </div>
    </div>
  );
}
