import FullPageLoadingState from '@/components/full-page-loading-state';
import { NotificationsTable } from '@/components/notifications/table';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/notifications/_tabs/notifications',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.notification.list.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.notification.list.queryOptions({
      projectId,
    }),
  );

  return <NotificationsTable query={query} />;
}
