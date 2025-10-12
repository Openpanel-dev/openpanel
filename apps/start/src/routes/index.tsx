import FullPageLoadingState from '@/components/full-page-loading-state';
import { LogoSquare } from '@/components/logo';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { useTRPC } from '@/integrations/trpc/react';
import { createTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: LandingPage,
  head: () => ({
    meta: [{ title: createTitle('Welcome') }],
  }),
  loader: async ({ context }) => {
    const organizations = await context.queryClient
      .fetchQuery(context.trpc.organization.list.queryOptions())
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
  const { data: organizations } = useQuery(
    trpc.organization.list.queryOptions(),
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="max-w-2xl mx-auto px-4 col gap-12">
        <div className="col gap-4">
          <LogoSquare className="w-full max-w-24" />
          <PageHeader
            title="Welcome to OpenPanel.dev"
            description="The best web and product analytics tool out there (our honest opinion)."
          />
        </div>

        <div className="space-y-2">
          {organizations?.map((org) => (
            <Link
              key={org.id}
              to={'/$organizationId'}
              params={{ organizationId: org.id }}
              className="block p-3 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all hover:translate-x-1"
            >
              <span className="font-medium text-gray-900">{org.name}</span>
              <span className="text-gray-500 text-sm ml-2">({org.id})</span>
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
