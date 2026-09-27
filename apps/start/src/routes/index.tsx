import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LogoSquare } from '@/components/logo';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { inviteErrorMessage } from '@/utils/invite-error';
import { createTitle } from '@/utils/title';
import { z } from 'zod';

const validateSearch = z.object({
  /**
   * Set by the OAuth callback when an invite could not be consumed. Carried
   * into onboarding so an invited user is told their invite expired instead of
   * silently being walked through creating an organization of their own.
   */
  inviteError: z.string().optional(),
});

export const Route = createFileRoute('/')({
  validateSearch,
  beforeLoad: ({ context }) => {
    if (!context.session?.session) {
      throw redirect({ to: '/login' });
    }
  },
  component: LandingPage,
  head: () => ({
    meta: [{ title: createTitle('Welcome') }],
  }),
  loader: async ({ context, location }) => {
    // Unsure why not using ensureQueryData here works
    // We need to put staleTime and gcTime to 0 to get the latest data
    // Even tho this query has never been called before
    const organizations = await context.queryClient
      .fetchQuery(
        context.trpc.organization.list.queryOptions(undefined, {
          staleTime: 0,
          gcTime: 0,
        })
      )
      .catch(() => []);

    const search = validateSearch.safeParse(location.search);
    const inviteError =
      search.success && search.data.inviteError
        ? search.data.inviteError
        : undefined;

    if (organizations.length === 0) {
      throw redirect({
        to: '/onboarding/project',
        search: inviteError ? { inviteError } : undefined,
      });
    }

    if (organizations.length === 1) {
      throw redirect({
        to: '/$organizationId',
        params: { organizationId: organizations[0].id },
        search: inviteError ? { inviteError } : undefined,
      });
    }
  },
  pendingComponent: FullPageLoadingState,
});

function LandingPage() {
  const trpc = useTRPC();
  const logout = useLogout();
  const { data: organizations } = useSuspenseQuery(
    trpc.organization.list.queryOptions()
  );
  const number = useNumber();
  const { inviteError } = Route.useSearch();
  const inviteMessage = inviteErrorMessage(inviteError);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="col mx-auto max-w-2xl gap-12 px-4 py-8">
        <div className="col gap-4">
          <LogoSquare className="w-full max-w-14 md:max-w-24" />
          <PageHeader
            description="The best web and product analytics tool out there (our honest opinion)."
            title="Welcome to OpenPanel.dev"
          />
        </div>

        {inviteMessage && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
            role="alert"
          >
            {inviteMessage}
          </div>
        )}

        <div className="col gap-2">
          {organizations?.map((org) => (
            <Link
              className="row items-center justify-between rounded-lg border bg-card p-3 transition-all hover:translate-x-1 hover:border-primary hover:shadow-md"
              key={org.id}
              params={{ organizationId: org.id }}
              to={'/$organizationId'}
            >
              <div className="col gap-2">
                <span className="font-medium text-lg">{org.name}</span>
                <span className="text-muted-foreground text-sm">
                  ({org.id})
                </span>
              </div>
              <span>
                {number.format(org.subscriptionPeriodEventsCount)}
                <span className="mx-1 opacity-50">/</span>
                {number.format(org.subscriptionPeriodEventsLimit)}
              </span>
            </Link>
          ))}
        </div>

        <div className="row gap-4">
          <Button loading={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
