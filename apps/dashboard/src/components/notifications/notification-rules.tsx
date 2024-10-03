'use client';

import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { AnimatePresence, motion } from 'framer-motion';
import { BoxSelectIcon, PencilRulerIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { FullPageEmptyState } from '../full-page-empty-state';
import {
  IntegrationCard,
  IntegrationCardLogo,
  IntegrationCardSkeleton,
} from '../integrations/integration-card';
import { Button } from '../ui/button';
import { RuleCard } from './rule-card';

export function NotificationRules() {
  const { projectId } = useAppParams();
  const query = api.notification.rules.useQuery({
    projectId,
  });
  const data = useMemo(() => {
    return query.data || [];
  }, [query.data]);

  const isLoading = query.isLoading;

  if (!isLoading && data.length === 0) {
    return (
      <FullPageEmptyState title="No rules yet" icon={PencilRulerIcon}>
        <p>
          You have not created any rules yet. Create a rule to start getting
          notifications.
        </p>
        <Button
          className="mt-8"
          variant="outline"
          onClick={() =>
            pushModal('AddNotificationRule', {
              rule: undefined,
            })
          }
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
          variant="outline"
          onClick={() =>
            pushModal('AddNotificationRule', {
              rule: undefined,
            })
          }
        >
          Add Rule
        </Button>
      </div>
      <div className="col gap-4 w-full grid md:grid-cols-2">
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
