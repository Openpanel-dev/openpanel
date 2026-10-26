import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import FullPageLoadingState from '@/components/full-page-loading-state';
import EditProjectAi from '@/components/settings/edit-project-ai';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';

export const Route = createFileRoute('/_app/$organizationId/$projectId/settings/_tabs/ai')({
  component: Component,
});

function Component() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(trpc.project.getProjectWithClients.queryOptions({ projectId }));

  if (query.isLoading) {
    return <FullPageLoadingState />;
  }
  if (!query.data) {
    return <div>Project not found</div>;
  }
  return <EditProjectAi project={query.data} />;
}
