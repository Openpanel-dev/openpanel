import { isOrganizationAdminRole } from '@openpanel/core/modules/organization/organization.constants';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Building2Icon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import Billing from '@/components/organization/billing';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { createOrganizationTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_app/$organizationId/billing')({
  component: OrganizationPage,
  head: () => {
    return {
      meta: [
        {
          title: createOrganizationTitle(PAGE_TITLES.BILLING),
        },
      ],
    };
  },
  beforeLoad: async ({ params, context }) => {
    const access = await context.queryClient.fetchQuery(
      context.trpc.organization.myAccess.queryOptions({
        organizationId: params.organizationId,
      })
    );
    if (!(access && isOrganizationAdminRole(access.role))) {
      throw redirect({
        to: '/$organizationId',
        params: { organizationId: params.organizationId },
      });
    }
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.subscription.products.queryOptions({
          organizationId: params.organizationId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.subscription.getCurrent.queryOptions({
          organizationId: params.organizationId,
        })
      ),
    ]);
  },
});

function OrganizationPage() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const { data: organization, isLoading } = useQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    })
  );

  if (isLoading) {
    return <FullPageLoadingState />;
  }

  if (!organization) {
    return (
      <EmptyState
        description="This workspace doesn't exist or you don't have access to it."
        icon={Building2Icon}
        title="Workspace not found"
        variant="page"
      />
    );
  }

  return (
    <div className="container p-8">
      <PageHeader
        className="mb-8"
        description="Manage your billing here"
        title="Billing"
      />

      <Billing organization={organization} />
    </div>
  );
}
