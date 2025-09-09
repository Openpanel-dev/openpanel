import FullPageLoadingState from '@/components/full-page-loading-state';
import ProjectClients from '@/components/settings/project-clients';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/settings/_tabs/clients',
)({
  component: Component,
});

function Component() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId }),
  );

  if (query.isLoading) {
    return <FullPageLoadingState />;
  }

  if (!query.data) {
    return <div>Project not found</div>;
  }

  return <ProjectClients project={query.data} />;
}
