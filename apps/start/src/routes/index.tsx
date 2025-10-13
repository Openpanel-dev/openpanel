import FullPageLoadingState from '@/components/full-page-loading-state';
import { LogoSquare } from '@/components/logo';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { createTitle } from '@/utils/title';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: LandingPage,
  head: () => ({
    meta: [{ title: createTitle('Welcome') }],
  }),
  loader: async ({ context }) => {
    const organizations = await context.queryClient
      .fetchQuery(
        context.trpc.organization.list.queryOptions(undefined, {
          staleTime: 0,
          gcTime: 0,
        }),
      )
      .catch(() => {
        throw redirect({ to: '/login' });
      });

    if (organizations.length === 1) {
      throw redirect({
        to: '/$organizationId',
        params: { organizationId: organizations[0].id },
      });
    }
  },
  pendingComponent: FullPageLoadingState,
});

function LandingPage() {
  const trpc = useTRPC();
  const logout = useLogout();
  const { data: organizations } = useSuspenseQuery(
    trpc.organization.list.queryOptions(),
  );
  const number = useNumber();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="max-w-2xl mx-auto px-4 col gap-12">
        <div className="col gap-4">
          <LogoSquare className="w-full max-w-24" />
          <PageHeader
            title="Welcome to OpenPanel.dev"
            description="The best web and product analytics tool out there (our honest opinion)."
          />
        </div>

        <div className="col gap-2">
          {organizations?.map((org) => (
            <Link
              key={org.id}
              to={'/$organizationId'}
              params={{ organizationId: org.id }}
              className="row justify-between items-center p-3 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all hover:translate-x-1"
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
          <Button onClick={() => logout.mutate()} loading={logout.isPending}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
