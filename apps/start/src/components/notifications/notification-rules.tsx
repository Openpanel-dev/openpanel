import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PencilRulerIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { FullPageEmptyState } from '../full-page-empty-state';
import { IntegrationCardSkeleton } from '../integrations/integration-card';
import { Button } from '../ui/button';
import { RuleCard } from './rule-card';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

export function NotificationRules() {
  const { projectId } = useAppParams();
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

  if (!isLoading && data.length === 0) {
    return (
      <FullPageEmptyState icon={PencilRulerIcon} title="No rules yet">
        <p>
          You have not created any rules yet. Create a rule to start getting
          notifications.
        </p>
        <Button
          className="mt-8"
          onClick={() =>
            pushModal('AddNotificationRule', {
              rule: undefined,
            })
          }
          variant="outline"
        >
          Add Rule
        </Button>
      </FullPageEmptyState>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <Button
          icon={PlusIcon}
          onClick={() =>
            pushModal('AddNotificationRule', {
              rule: undefined,
            })
          }
          variant="outline"
        >
          Add Rule
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
