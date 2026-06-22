import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import type { NotificationRule } from '@openpanel/db';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { FilterIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ColorSquare } from '../color-square';
import {
  IntegrationCardFooter,
  IntegrationCardHeader,
} from '../integrations/integration-card';
import { PingBadge } from '../ping';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltiper } from '../ui/tooltip';

function EventBadge({
  event,
}: { event: NotificationRule['config']['events'][number] }) {
  const { t } = useTranslation();

  return (
    <Tooltiper
      disabled={!event.filters.length}
      content={
        <div className="col gap-2 font-mono">
          {event.filters.map((filter) => (
            <div key={filter.id}>
              {filter.name} {filter.operator} {JSON.stringify(filter.value)}
            </div>
          ))}
        </div>
      }
    >
      <Badge variant="outline" className="inline-flex">
        {event.name === '*' ? t('notifications.rule_any_event') : event.name}
        {Boolean(event.filters.length) && (
          <FilterIcon className="size-2 ml-1" />
        )}
      </Badge>
    </Tooltiper>
  );
}

export function RuleCard({
  rule,
}: { rule: RouterOutputs['notification']['rules'][number] }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const client = useQueryClient();
  const deletion = useMutation(
    trpc.notification.deleteRule.mutationOptions({
      onSuccess() {
        toast.success(t('notifications.rule_deleted_success'));
        client.refetchQueries(
          trpc.notification.rules.queryOptions({
            projectId: rule.projectId,
          }),
        );
      },
    }),
  );
  const renderConfig = () => {
    switch (rule.config.type) {
      case 'events':
        return (
          <div className="row gap-2 items-baseline flex-wrap">
            <Trans i18nKey="notifications.rule_events_description">
              <span className="contents">
                {rule.config.events.map((event) => (
                  <EventBadge key={event.id} event={event} />
                ))}
              </span>
            </Trans>
          </div>
        );
      case 'funnel':
        return (
          <div className="col gap-4">
            <div>{t('notifications.rule_funnel_description')}</div>
            <div className="col gap-2">
              {rule.config.events.map((event, index) => (
                <div
                  key={event.id}
                  className="row gap-2 items-center font-mono"
                >
                  <ColorSquare>{index + 1}</ColorSquare>
                  <EventBadge key={event.id} event={event} />
                </div>
              ))}
            </div>
          </div>
        );
    }
  };
  return (
    <div className="card">
      <IntegrationCardHeader>
        <div className="title">{rule.name}</div>
      </IntegrationCardHeader>
      <div className="p-4 col gap-2">{renderConfig()}</div>
      <IntegrationCardFooter className="row gap-2 justify-between items-center">
        <div className="row gap-2 flex-wrap">
          {rule.integrations.map((integration) => (
            <PingBadge key={integration.id}>{integration.name}</PingBadge>
          ))}
        </div>
        <div className="row gap-2">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              showConfirm({
                title: t('notifications.delete_rule_confirm_title', {
                  name: rule.name,
                }),
                text: t('notifications.delete_rule_confirm_description'),
                onConfirm: () => {
                  deletion.mutate({
                    id: rule.id,
                  });
                },
              });
            }}
          >
            {t('notifications.action_delete')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              pushModal('AddNotificationRule', {
                rule,
              });
            }}
          >
            {t('notifications.action_edit')}
          </Button>
        </div>
      </IntegrationCardFooter>
    </div>
  );
}
