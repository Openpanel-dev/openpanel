'use client';

import { useAppParams } from '@/hooks/useAppParams';
import { pushModal, showConfirm } from '@/modals';
import { api } from '@/trpc/client';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BoxSelectIcon } from 'lucide-react';
import { useMemo } from 'react';
import { PingBadge } from '../ping';
import { Button } from '../ui/button';
import {
  IntegrationCard,
  IntegrationCardFooter,
  IntegrationCardLogo,
  IntegrationCardSkeleton,
} from './integration-card';
import { INTEGRATIONS } from './integrations';

export function ActiveIntegrations() {
  const { organizationId } = useAppParams();
  const query = api.integration.list.useQuery({
    organizationId,
  });
  const client = useQueryClient();
  const deletion = api.integration.delete.useMutation({
    onSuccess() {
      client.refetchQueries(
        getQueryKey(api.integration.list, {
          organizationId,
        }),
      );
    },
  });

  const data = useMemo(() => {
    return (query.data || [])
      .map((item) => {
        const integration = INTEGRATIONS.find(
          (integration) => integration.type === item.config.type,
        )!;
        return {
          ...item,
          integration,
        };
      })
      .filter((item) => item.integration);
  }, [query.data]);

  const isLoading = query.isLoading;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 auto-rows-auto">
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
              <IntegrationCard {...item.integration} name={item.name}>
                <IntegrationCardFooter className="row justify-between items-center">
                  <PingBadge>Connected</PingBadge>
                  <div className="row gap-2">
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        showConfirm({
                          title: `Delete ${item.name}?`,
                          text: 'This action cannot be undone.',
                          onConfirm: () => {
                            deletion.mutate({
                              id: item.id,
                            });
                          },
                        });
                      }}
                    >
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        pushModal('AddIntegration', {
                          id: item.id,
                          type: item.config.type,
                        });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </IntegrationCardFooter>
              </IntegrationCard>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
