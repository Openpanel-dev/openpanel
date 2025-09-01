import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/integrations/_tabs/',
)({
  component: Component,
});

function Component() {
  // const { projectId } = useAppParams();
  // const trpc = useTRPC();
  // const query = useQuery(
  //   trpc.project.getProjectWithClients.queryOptions({ projectId }),
  // );

  // if (query.isLoading) {
  //   return <FullPageLoadingState />;
  // }

  // if (!query.data) {
  //   return <div>Project not found</div>;
  // }

  return <div className="space-y-6">Installed</div>;
}
