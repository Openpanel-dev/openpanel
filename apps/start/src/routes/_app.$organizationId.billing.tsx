import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import Billing from '@/components/organization/billing';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';

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
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.subscription.products.queryOptions({
          organizationId: params.organizationId,
        }),
      ),
      context.queryClient.prefetchQuery(
        context.trpc.subscription.getCurrent.queryOptions({
          organizationId: params.organizationId,
        }),
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
    }),
  );

  if (isLoading) {
    return <FullPageLoadingState />;
  }

  if (!organization) {
    return (
      <FullPageEmptyState title="Organization not found" icon={BoxSelectIcon} />
    );
  }

  return (
    <div className="container p-8">
      <PageHeader
        title="Billing"
        description="Manage your billing here"
        className="mb-8"
      />

      <Billing organization={organization} />
    </div>
  );
}
