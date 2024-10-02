'use client';

import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { AnimatePresence, motion } from 'framer-motion';
import { BoxSelectIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
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
        {!isLoading && data.length === 0 && (
          <IntegrationCard
            icon={
              <IntegrationCardLogo className="bg-def-200 text-foreground">
                <BoxSelectIcon className="size-10" strokeWidth={1} />
              </IntegrationCardLogo>
            }
            name="No integrations yet"
            description="Integrations allow you to connect your systems to OpenPanel. You can add them in the available integrations section."
          />
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
