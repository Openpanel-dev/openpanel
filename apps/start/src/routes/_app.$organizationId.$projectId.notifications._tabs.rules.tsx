import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRingIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { IntegrationCardSkeleton } from '@/components/integrations/integration-card';
import { RuleCard } from '@/components/notifications/rule-card';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/notifications/_tabs/rules'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.notification.rules.queryOptions({
        projectId: params.projectId,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.notification.rules.queryOptions({
      projectId,
    })
  );
  const data = useMemo(() => {
    return query.data || [];
  }, [query.data]);

  const isLoading = query.isLoading;

  const addRule = () => pushModal('AddNotificationRule', { rule: undefined });

  if (!isLoading && data.length === 0) {
    return (
      <EmptyState
        description="Get a message when an event fires or a funnel is completed, in Slack, Discord, email or a webhook."
        icon={BellRingIcon}
        title="No notification rules yet"
      >
        <Button icon={PlusIcon} onClick={addRule}>
          Add rule
        </Button>
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <Button icon={PlusIcon} onClick={addRule} variant="outline">
          Add rule
        </Button>
      </div>
      <div className="col grid w-full gap-4 md:grid-cols-2">
        {isLoading && (
          <>
            <IntegrationCardSkeleton />
            <IntegrationCardSkeleton />
            <IntegrationCardSkeleton />
          </>
        )}
        <AnimatePresence mode="popLayout">
          {data.map((item) => {
            return (
              <motion.div key={item.id} layout="position">
                <RuleCard rule={item} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
