import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PencilIcon, PlusIcon, SparklesIcon, TrashIcon } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/custom-events',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.CUSTOM_EVENTS || 'Custom Events'),
        },
      ],
    };
  },
  async loader({ context, params }) {
    await context.queryClient.prefetchQuery(
      context.trpc.customEvent.list.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.customEvent.list.queryOptions({
      projectId,
    }),
  );
  const customEvents = query.data ?? [];

  const deletion = useMutation(
    trpc.customEvent.delete.mutationOptions({
      onError: handleErrorToastOptions(),
      onSuccess() {
        query.refetch();
        toast('Success', {
          description: 'Custom event deleted.',
        });
      },
    }),
  );

  if (customEvents.length === 0) {
    return (
      <FullPageEmptyState title="No custom events" icon={SparklesIcon}>
        <p>You have not created any custom events for this project yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Custom events let you combine multiple events into a single metric
        </p>
        <Button
          onClick={() => pushModal('AddCustomEvent')}
          className="mt-14"
          icon={PlusIcon}
        >
          Create custom event
        </Button>
      </FullPageEmptyState>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Custom Events"
        description="Combine multiple events into custom metrics for simplified analytics"
        className="mb-8"
        actions={
          <Button icon={PlusIcon} onClick={() => pushModal('AddCustomEvent')}>
            <span className="max-sm:hidden">Create custom event</span>
            <span className="sm:hidden">Custom Event</span>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {customEvents.map((customEvent) => {
          const definition = customEvent.definition as any;
          const eventCount = definition?.events?.length ?? 0;
          return (
            <Card key={customEvent.id} hover>
              <div className="flex flex-col p-4">
                <div className="col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{customEvent.name}</div>
                  </div>
                  {customEvent.description && (
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      {customEvent.description}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <SparklesIcon size={14} />
                      <span>
                        {eventCount} source {eventCount === 1 ? 'event' : 'events'}
                      </span>
                    </div>
                  </div>
                  {customEvent.conversion && (
                    <div className="mt-1 inline-flex w-fit rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      Conversion
                    </div>
                  )}
                </div>
              </div>

              <CardActions>
                <CardActionsItem className="w-full" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      pushModal('EditCustomEvent', customEvent);
                    }}
                  >
                    <PencilIcon size={16} />
                    Edit
                  </button>
                </CardActionsItem>
                <CardActionsItem className="w-full text-destructive" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      showConfirm({
                        title: 'Delete custom event',
                        text: 'Are you sure you want to delete this custom event? This action cannot be undone.',
                        onConfirm: () => deletion.mutate({ id: customEvent.id }),
                      });
                    }}
                  >
                    <TrashIcon size={16} />
                    Delete
                  </button>
                </CardActionsItem>
              </CardActions>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
