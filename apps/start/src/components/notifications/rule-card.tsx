import type { NotificationRule } from '@openpanel/db';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilterIcon } from 'lucide-react';
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
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';

function EventBadge({
  event,
}: {
  event: NotificationRule['config']['events'][number];
}) {
  return (
    <Tooltiper
      content={
        <div className="col gap-2 font-mono">
          {event.filters.map((filter) => (
            <div key={filter.id}>
              {filter.name} {filter.operator} {JSON.stringify(filter.value)}
            </div>
          ))}
        </div>
      }
      disabled={!event.filters.length}
    >
      <Badge className="inline-flex" variant="outline">
        {event.name === '*' ? 'Any event' : event.name}
        {Boolean(event.filters.length) && (
          <FilterIcon className="ml-1 size-2" />
        )}
      </Badge>
    </Tooltiper>
  );
}

export function RuleCard({
  rule,
}: {
  rule: RouterOutputs['notification']['rules'][number];
}) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const deletion = useMutation(
    trpc.notification.deleteRule.mutationOptions({
      onSuccess() {
        toast.success('Rule deleted');
        client.refetchQueries(
          trpc.notification.rules.queryOptions({
            projectId: rule.projectId,
          })
        );
      },
    })
  );
  const renderConfig = () => {
    switch (rule.config.type) {
      case 'events':
        return (
          <div className="row flex-wrap items-baseline gap-2">
            <div>Get notified when</div>
            {rule.config.events.map((event) => (
              <EventBadge event={event} key={event.id} />
            ))}
            <div>occurs</div>
          </div>
        );
      case 'funnel':
        return (
          <div className="col gap-4">
            <div>Get notified when a session has completed this funnel</div>
            <div className="col gap-2">
              {rule.config.events.map((event, index) => (
                <div
                  className="row items-center gap-2 font-mono"
                  key={event.id}
                >
                  <ColorSquare>{index + 1}</ColorSquare>
                  <EventBadge event={event} key={event.id} />
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
      <div className="col gap-2 p-4">{renderConfig()}</div>
      <IntegrationCardFooter className="row items-center justify-between gap-2">
        <div className="row flex-wrap gap-2">
          {rule.integrations.map((integration) => (
            <PingBadge key={integration.id}>{integration.name}</PingBadge>
          ))}
        </div>
        <div className="row gap-2">
          <Button
            className="text-destructive"
            onClick={() => {
              showConfirm({
                title: `Delete ${rule.name}?`,
                text: 'This action cannot be undone.',
                onConfirm: () => {
                  deletion.mutate({
                    id: rule.id,
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
              pushModal('AddNotificationRule', {
                rule,
              });
            }}
            variant="ghost"
          >
            Edit
          </Button>
        </div>
      </IntegrationCardFooter>
    </div>
  );
}
