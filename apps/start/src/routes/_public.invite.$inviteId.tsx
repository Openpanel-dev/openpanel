import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { AlertCircleIcon } from 'lucide-react';
import { AuthHeading } from '@/components/auth/auth-shell';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { isSignedIn } from '@/utils/route-session';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_public/invite/$inviteId')({
  head: () => ({
    meta: [
      { title: createEntityTitle('Accept invitation', PAGE_TITLES.ONBOARDING) },
      { name: 'robots', content: 'noindex, follow' },
    ],
  }),
  beforeLoad: async ({ context, params }) => {
    if (!(await isSignedIn(context))) {
      throw redirect({
        to: '/onboarding',
        search: { inviteId: params.inviteId },
      });
    }
  },
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.organization.getInvite.queryOptions({
        inviteId: params.inviteId,
      })
    );
  },
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { inviteId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: session } = useSuspenseQuery(trpc.auth.session.queryOptions());
  const { data: invite, isError } = useQuery(
    trpc.organization.getInvite.queryOptions({ inviteId })
  );
  const accept = useMutation(
    trpc.organization.acceptInvite.mutationOptions({
      onSuccess({ organizationId }) {
        navigate({ to: '/$organizationId', params: { organizationId } });
      },
      onError: handleError,
    })
  );

  if (isError) {
    return (
      <InviteProblem
        description="It may have been revoked or already accepted."
        title="Invitation not found"
      />
    );
  }
  if (!invite) {
    return null;
  }

  const organizationName = invite.organization?.name ?? 'the workspace';
  if (invite.isExpired) {
    return (
      <InviteProblem
        description="Ask the workspace owner for a new one."
        title={`The invitation to ${organizationName} has expired`}
      />
    );
  }

  const signedInEmail = session.user?.email ?? '';
  const isInvitedAccount =
    signedInEmail.toLowerCase() === invite.email.toLowerCase();

  return (
    <div className="col w-full gap-8">
      <AuthHeading
        description={
          isInvitedAccount
            ? `You were invited as ${invite.email}.`
            : `This invitation was sent to ${invite.email}, but you are signed in as ${signedInEmail}. Sign in with that address to accept it.`
        }
        title={`Join ${organizationName}`}
      />
      {isInvitedAccount ? (
        <Button
          className="w-full"
          loading={accept.isPending}
          onClick={() => accept.mutate({ inviteId })}
          size="xl"
        >
          Accept invitation
        </Button>
      ) : (
        <Button
          className="w-full"
          loading={logout.isPending}
          onClick={() => logout.mutate()}
          size="xl"
          variant="outline"
        >
          Sign out
        </Button>
      )}
    </div>
  );
}

function InviteProblem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="row items-start gap-3 rounded-xl bg-destructive/10 p-4">
      <AlertCircleIcon className="mt-0.5 shrink-0 text-destructive" size={18} />
      <div className="col gap-0.5">
        <div className="font-medium">{title}</div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
