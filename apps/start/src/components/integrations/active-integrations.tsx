import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PlugIcon } from 'lucide-react';
import { useMemo } from 'react';
import { PingBadge } from '../ping';
import { Button, LinkButton } from '../ui/button';
import {
  IntegrationCard,
  IntegrationCardFooter,
  IntegrationCardSkeleton,
} from './integration-card';
import { INTEGRATIONS } from './integrations';
import { EmptyState } from '@/components/empty-state';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';

export function ActiveIntegrations() {
  const { organizationId, projectId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.integration.list.queryOptions({
      projectId: projectId!,
    })
  );
  const client = useQueryClient();
  const deletion = useMutation(
    trpc.integration.delete.mutationOptions({
      onSuccess() {
        client.refetchQueries(
          trpc.integration.list.queryFilter({
            projectId,
          })
        );
      },
    })
  );

  const data = useMemo(() => {
    return (query.data || [])
      .map((item) => {
        const integration = INTEGRATIONS.find(
          (integration) => integration.type === item.config.type
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
    <div className="grid auto-rows-auto grid-cols-1 gap-4 md:grid-cols-2">
      {isLoading && (
        <>
          <IntegrationCardSkeleton />
          <IntegrationCardSkeleton />
          <IntegrationCardSkeleton />
        </>
      )}
      {!isLoading && data.length === 0 && (
        <EmptyState
          className="md:col-span-2"
          description="Connect Slack, Discord or a webhook to send notifications and data to the tools you already use."
          icon={PlugIcon}
          title="No integrations yet"
        >
          <LinkButton
            params={{ organizationId, projectId }}
            to="/$organizationId/$projectId/integrations/available"
          >
            Browse integrations
          </LinkButton>
        </EmptyState>
      )}
      <AnimatePresence mode="popLayout">
        {data.map((item) => {
          return (
            <motion.div key={item.id} layout="position">
              <IntegrationCard {...item.integration} name={item.name}>
                <IntegrationCardFooter className="row items-center justify-between">
                  <PingBadge>Connected</PingBadge>
                  <div className="row gap-2">
                    <Button
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
                      variant="ghost"
                    >
                      Delete
                    </Button>
                    <Button
                      onClick={() => {
                        pushModal('AddIntegration', {
                          id: item.id,
                          type: item.config.type,
                        });
                      }}
                      variant="ghost"
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
