import BillingPrompt from '@/components/organization/billing-prompt';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { FREE_PRODUCT_IDS } from '@openpanel/payments';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId/$projectId')({
  component: ProjectDashboard,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.DASHBOARD),
        },
      ],
    };
  },
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
});

function ProjectDashboard() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const { data: organization } = useSuspenseQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    }),
  );

  if (
    organization.subscriptionProductId &&
    FREE_PRODUCT_IDS.includes(organization.subscriptionProductId)
  ) {
    return <BillingPrompt organization={organization} type={'freePlan'} />;
  }

  if (organization.isExpired) {
    return (
      <BillingPrompt
        organization={organization}
        type={
          organization.subscriptionStatus === 'trialing'
            ? 'trialEnded'
            : 'expired'
        }
      />
    );
  }

  return <Outlet />;
}
