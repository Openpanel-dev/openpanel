import { FREE_PRODUCT_IDS } from '@openpanel/payments';
import { subscriptionBlocksDashboard } from '@openpanel/payments/subscription-state';
import { getSubscriptionStateMeta } from '@openpanel/payments/subscription-state-meta';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import BillingPrompt from '@/components/organization/billing-prompt';
import { useProjectDocumentTitle } from '@/hooks/use-project-document-title';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

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
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.organization.get.queryOptions({
          organizationId: params.organizationId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.project.getProjectWithClients.queryOptions({
          projectId: params.projectId,
        })
      ),
    ]);
  },
});

function ProjectDashboard() {
  const { organizationId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: organization } = useSuspenseQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    })
  );
  const { data: project } = useSuspenseQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId })
  );
  useProjectDocumentTitle(project?.name);

  if (
    organization.subscriptionProductId &&
    FREE_PRODUCT_IDS.includes(organization.subscriptionProductId)
  ) {
    return <BillingPrompt organization={organization} type={'freePlan'} />;
  }

  if (subscriptionBlocksDashboard(organization.subscriptionState)) {
    const { blockType } = getSubscriptionStateMeta(
      organization.subscriptionState,
      {
        endsAt: organization.subscriptionEndsAt,
        canceledAt: organization.subscriptionCanceledAt,
      }
    );
    return (
      <BillingPrompt
        organization={organization}
        type={blockType ?? 'expired'}
      />
    );
  }

  return <Outlet />;
}
