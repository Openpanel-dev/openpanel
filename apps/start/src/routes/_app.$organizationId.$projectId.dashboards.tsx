import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  Copy,
  LayoutPanelTopIcon,
  Pencil,
  PlusIcon,
  Trash,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardActions, CardActionsItem } from '@/components/card';
import { DashboardPreview } from '@/components/dashboard-preview';
import { EmptyState } from '@/components/empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/dashboards'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle('Dashboards'),
        },
      ],
    };
  },
  async loader({ context, params }) {
    await context.queryClient.prefetchQuery(
      context.trpc.dashboard.list.queryOptions({
        projectId: params.projectId,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(
    trpc.dashboard.list.queryOptions({
      projectId,
    })
  );
  const dashboards = query.data ?? [];
  const duplication = useMutation(
    trpc.dashboard.duplicate.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess(dashboard) {
        query.refetch();
        toast('Success', {
          description: `Created "${dashboard.name}".`,
        });
      },
    })
  );
  const deletion = useMutation(
    trpc.dashboard.delete.mutationOptions({
      onError: (error, variables) => {
        return handleErrorToastOptions({
          action: {
            label: 'Force delete',
            onClick: () => {
              deletion.mutate({
                forceDelete: true,
                id: variables.id,
              });
            },
          },
        })(error);
      },
      onSuccess() {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        query.refetch();
        toast('Success', {
          description: 'Dashboard deleted.',
        });
      },
    })
  );

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button icon={PlusIcon} onClick={() => pushModal('AddDashboard')}>
            <span className="max-sm:hidden">Create dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </Button>
        }
        className="mb-8"
        description="Access all your dashboards here"
        title="Dashboards"
      />
      {dashboards.length === 0 ? (
        <EmptyState
          description="Put the reports you check most often on one page, then share it with your team or embed it."
          icon={LayoutPanelTopIcon}
          title="No dashboards yet"
        >
          <Button icon={PlusIcon} onClick={() => pushModal('AddDashboard')}>
            Create dashboard
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {dashboards.map((item) => (
            <Card className="group" hover key={item.id}>
              <Link
                className="col gap-3 p-3"
                from={Route.fullPath}
                to={`${item.id}`}
              >
                <DashboardPreview reports={item.reports} />
                <div className="col gap-0.5 px-1">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="truncate text-muted-foreground text-sm">
                    {item.reports.length}{' '}
                    {item.reports.length === 1 ? 'report' : 'reports'} · Updated{' '}
                    {format(item.updatedAt, 'MMM d, HH:mm')}
                  </div>
                </div>
              </Link>

              <CardActions>
                <CardActionsItem asChild className="w-full">
                  <button
                    onClick={() => {
                      pushModal('EditDashboard', item);
                    }}
                    type="button"
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                </CardActionsItem>
                <CardActionsItem asChild className="w-full">
                  <button
                    disabled={duplication.isPending}
                    onClick={() => duplication.mutate({ id: item.id })}
                    type="button"
                  >
                    <Copy size={16} />
                    Duplicate
                  </button>
                </CardActionsItem>
                <CardActionsItem asChild className="w-full text-destructive">
                  <button
                    onClick={() => {
                      showConfirm({
                        title: 'Delete dashboard',
                        text: 'Are you sure you want to delete this dashboard? All your reports will be deleted!',
                        onConfirm: () => deletion.mutate({ id: item.id }),
                      });
                    }}
                    type="button"
                  >
                    <Trash size={16} />
                    Delete
                  </button>
                </CardActionsItem>
              </CardActions>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
