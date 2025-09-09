import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import Billing from '@/components/organization/billing';
import { BillingFaq } from '@/components/organization/billing-faq';
import CurrentSubscription from '@/components/organization/current-subscription';
import Usage from '@/components/organization/usage';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';

export const Route = createFileRoute('/_app/$organizationId/billing')({
  component: OrganizationPage,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
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

      <div className="flex flex-col-reverse md:flex-row gap-8 max-w-screen-lg">
        <div className="col gap-8 w-full">
          <Billing organization={organization} />
          <Usage organization={organization} />
          <BillingFaq />
        </div>
        <CurrentSubscription organization={organization} />
      </div>
    </div>
  );
}
