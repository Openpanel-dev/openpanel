import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AnimatePresence, motion } from 'framer-motion';
import { BoxSelectIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PingBadge } from '../ping';
import { Button } from '../ui/button';
import {
  IntegrationCard,
  IntegrationCardFooter,
  IntegrationCardLogo,
  IntegrationCardSkeleton,
} from './integration-card';
import { useIntegrations } from './integrations';

export function ActiveIntegrations() {
  const { t } = useTranslation();
  const integrations = useIntegrations();
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.integration.list.queryOptions({
      organizationId: organizationId!,
    }),
  );
  const client = useQueryClient();
  const deletion = useMutation(
    trpc.integration.delete.mutationOptions({
      onSuccess() {
        client.refetchQueries(
          trpc.integration.list.queryFilter({
            organizationId,
          }),
        );
      },
    }),
  );

  const data = useMemo(() => {
    return (query.data || [])
      .map((item) => {
        const integration = integrations.find(
          (integration) => integration.type === item.config.type,
        )!;
        return {
          ...item,
          integration,
        };
      })
      .filter((item) => item.integration);
  }, [integrations, query.data]);

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
          name={t('integrations.empty_installed_title')}
          description={t('integrations.empty_installed_description')}
        />
      )}
      <AnimatePresence mode="popLayout">
        {data.map((item) => {
          return (
            <motion.div key={item.id} layout="position">
              <IntegrationCard {...item.integration} name={item.name}>
                <IntegrationCardFooter className="row justify-between items-center">
                  <PingBadge>{t('integrations.status_connected')}</PingBadge>
                  <div className="row gap-2">
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        showConfirm({
                          title: t('integrations.delete_confirm_title', {
                            name: item.name,
                          }),
                          text: t('integrations.delete_confirm_description'),
                          onConfirm: () => {
                            deletion.mutate({
                              id: item.id,
                            });
                          },
                        });
                      }}
                    >
                      {t('integrations.action_delete')}
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
                      {t('integrations.action_edit')}
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
