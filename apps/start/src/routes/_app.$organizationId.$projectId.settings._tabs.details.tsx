import FullPageLoadingState from '@/components/full-page-loading-state';
import DeleteProject from '@/components/settings/delete-project';
import EditProjectDetails from '@/components/settings/edit-project-details';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/details',
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

  return (
    <div className="space-y-6">
      <EditProjectDetails project={query.data} />
      <DeleteProject project={query.data} />
    </div>
  );
}
