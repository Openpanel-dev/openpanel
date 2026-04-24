import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import type { NotificationRule } from '@openpanel/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppParams } from '@/hooks/use-app-params';
import { CopyIcon, FilterIcon } from 'lucide-react';
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
        {event.name === '*' ? 'Any event' : event.name}
        {Boolean(event.filters.length) && (
          <FilterIcon className="size-2 ml-1" />
        )}
      </Badge>
    </Tooltiper>
  );
}

function useReport(reportId: string | undefined) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.report.listByProject.queryOptions({ projectId }),
  );
  if (!reportId || !data) return undefined;
  const reports = (Array.isArray(data) ? data : []) as {
    id: string;
    name: string;
    chartType: string;
  }[];
  return reports.find((r) => r.id === reportId);
}

export function RuleCard({
  rule,
}: { rule: RouterOutputs['notification']['rules'][number] }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const config = rule.config as { type: string; reportId?: string };
  const report = useReport(config.reportId);
  const reportName = report?.name ?? 'Unknown report';
  const isPercentageChart =
    report?.chartType === 'conversion' || report?.chartType === 'funnel';
  const deletion = useMutation(
    trpc.notification.deleteRule.mutationOptions({
      onSuccess() {
        toast.success('Rule deleted');
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
            <div>Get notified when</div>
            {rule.config.events.map((event) => (
              <EventBadge key={event.id} event={event} />
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
      case 'threshold': {
        const tc = rule.config as {
          operator: string;
          value: number;
          frequency: string;
        };
        return (
          <div className="row gap-2 items-baseline flex-wrap">
            <div>Alert when</div>
            <Badge variant="outline">{reportName}</Badge>
            <div>
              is {tc.operator} {tc.value}{isPercentageChart ? '%' : ''}
            </div>
            <Badge variant="secondary">{tc.frequency}</Badge>
          </div>
        );
      }
      case 'anomaly': {
        const ac = rule.config as {
          confidence: string;
          frequency: string;
        };
        return (
          <div className="row gap-2 items-baseline flex-wrap">
            <div>Alert when</div>
            <Badge variant="outline">{reportName}</Badge>
            <div>is outside {ac.confidence}% confidence band</div>
            <Badge variant="secondary">{ac.frequency}</Badge>
          </div>
        );
      }
      case 'flow': {
        const fc = rule.config as {
          triggerEvent: string;
          delayMinutes: number;
          exitEvent?: string;
          triggerFilters?: unknown[];
        };
        const delayLabel =
          fc.delayMinutes >= 1440
            ? `${Math.round(fc.delayMinutes / 1440)}d`
            : fc.delayMinutes >= 60
              ? `${Math.round(fc.delayMinutes / 60)}h`
              : `${fc.delayMinutes}m`;
        return (
          <div className="row gap-2 items-baseline flex-wrap">
            <div>Fire</div>
            <Badge variant="secondary">{delayLabel}</Badge>
            <div>after</div>
            <Badge variant="outline">
              {fc.triggerEvent}
              {Boolean(fc.triggerFilters?.length) && (
                <FilterIcon className="size-2 ml-1" />
              )}
            </Badge>
            {fc.exitEvent && (
              <>
                <div>unless user does</div>
                <Badge variant="outline">{fc.exitEvent}</Badge>
              </>
            )}
          </div>
        );
      }
    }
  };
  const isFlowRule = rule.config.type === 'flow';
  return (
    <div className="card">
      <IntegrationCardHeader>
        <div className="title">{rule.name}</div>
      </IntegrationCardHeader>
      <div className="p-4 col gap-2">
        {renderConfig()}
        {isFlowRule && (
          <div className="row gap-2 items-center mt-2 text-xs text-muted-foreground">
            <span>Rule ID:</span>
            <code className="font-mono bg-def-100 rounded px-1.5 py-0.5">
              {rule.id}
            </code>
            <Button
              size="icon"
              variant="ghost"
              icon={CopyIcon}
              onClick={() => {
                navigator.clipboard.writeText(rule.id);
                toast.success('Rule ID copied');
              }}
            />
          </div>
        )}
      </div>
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
                title: `Delete ${rule.name}?`,
                text: 'This action cannot be undone.',
                onConfirm: () => {
                  deletion.mutate({
                    id: rule.id,
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
              pushModal('AddNotificationRule', {
                rule,
              });
            }}
          >
            Edit
          </Button>
        </div>
      </IntegrationCardFooter>
    </div>
  );
}
