import type { IServiceProjectWithClients } from '@openpanel/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';

interface Props {
  project: IServiceProjectWithClients;
}

export default function EditProjectAi({ project }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('AI settings updated');
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          })
        );
      },
    })
  );

  return (
    <div className="space-y-6">
      <Widget>
        <WidgetHead>
          <span className="title">Content storage</span>
        </WidgetHead>
        <WidgetBody className="col gap-4">
          <div className="row items-center justify-between gap-6">
            <div className="col gap-1">
              <Label htmlFor="ai-store-content">
                Store prompts and completions
              </Label>
              <p className="text-muted-foreground text-sm">
                When off, OpenPanel keeps model, tokens, cost, latency and
                errors for every call but drops the messages, outputs and tool
                definitions before they are stored. Stored content expires after
                30 days either way.
              </p>
            </div>
            <Switch
              checked={project.aiStoreContent}
              disabled={mutation.isPending}
              id="ai-store-content"
              onCheckedChange={(checked) =>
                mutation.mutate({ id: project.id, aiStoreContent: checked })
              }
            />
          </div>
        </WidgetBody>
      </Widget>
      <Widget>
        <WidgetHead>
          <span className="title">Pricing</span>
        </WidgetHead>
        <WidgetBody>
          <p className="text-muted-foreground text-sm">
            Cost is computed at ingest from a built-in price catalog covering
            the major providers. Send <code className="font-mono">cost</code> on
            an event to store the price your gateway reports instead. Calls to a
            model that is not in the catalog are stored with a cost of zero.
          </p>
        </WidgetBody>
      </Widget>
    </div>
  );
}
