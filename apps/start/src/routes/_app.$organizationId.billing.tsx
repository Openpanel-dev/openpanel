import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import Billing from '@/components/organization/billing';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
      }),
    );
    if (access?.role !== 'org:admin') {
      throw redirect({
        to: '/$organizationId',
        params: { organizationId: params.organizationId },
      });
    }
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
  const { t } = useTranslation();
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
      <FullPageEmptyState
        title={t('organization.not_found')}
        icon={BoxSelectIcon}
      />
    );
  }

  return (
    <div className="container p-8">
      <PageHeader
        title={t('billing.page_title')}
        description={t('billing.page_description')}
        className="mb-8"
      />

      <Billing organization={organization} />
    </div>
  );
}
