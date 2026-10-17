import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';

export function CustomEvents() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.customEvent.list.queryOptions({ projectId }));
  const deletion = useMutation(
    trpc.customEvent.delete.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.customEvent.list.pathFilter());
        queryClient.invalidateQueries(trpc.chart.pathFilter());
      },
      onError: handleError,
    })
  );

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead className="space-y-2">
        <span className="title">Custom events</span>
        <p className="text-muted-foreground">
          Name a group of events once, like "Used navigation", and pick it in
          any report. Each event can be narrowed with its own filters.
        </p>
      </WidgetHead>
      <WidgetBody className="col gap-2">
        {query.data?.map((customEvent) => (
          <div
            className="row items-center gap-2 rounded-lg border bg-def-100 p-2 pl-4"
            key={customEvent.id}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{customEvent.name}</div>
              <div className="truncate text-muted-foreground text-sm">
                {customEvent.items.map((item) => item.name).join(', ')}
              </div>
            </div>
            <Button
              aria-label={`Edit ${customEvent.name}`}
              icon={PencilIcon}
              onClick={() => pushModal('CustomEvent', { customEvent })}
              size="icon"
              variant="ghost"
            />
            <Button
              aria-label={`Delete ${customEvent.name}`}
              icon={Trash2Icon}
              onClick={() =>
                showConfirm({
                  title: 'Delete custom event',
                  text: `Reports using "${customEvent.name}" will stop loading until you pick another event.`,
                  onConfirm() {
                    deletion.mutate({ id: customEvent.id, projectId });
                  },
                })
              }
              size="icon"
              variant="ghost"
            />
          </div>
        ))}
        <div>
          <Button
            icon={PlusIcon}
            onClick={() => pushModal('CustomEvent')}
            variant="outline"
          >
            Add custom event
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}
