import FullPageLoadingState from '@/components/full-page-loading-state';
import EditProjectFilters from '@/components/settings/edit-project-filters';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/events',
)({
  component: Component,
});

function Component() {
  const { t } = useTranslation();
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId }),
  );

  if (query.isLoading) {
    return <FullPageLoadingState />;
  }

  if (!query.data) {
    return <div>{t('settings.project_not_found')}</div>;
  }

  return <EditProjectFilters project={query.data} />;
}
