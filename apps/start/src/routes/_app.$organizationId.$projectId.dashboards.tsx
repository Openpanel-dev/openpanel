import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal, showConfirm } from '@/modals';
import { cn } from '@/utils/cn';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { format } from 'date-fns';
import {
  AreaChartIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  ChartScatterIcon,
  ConeIcon,
  GitBranchIcon,
  Globe2Icon,
  HashIcon,
  LayoutPanelTopIcon,
  LineChartIcon,
  CopyIcon,
  Pencil,
  PieChartIcon,
  PlusIcon,
  Share2Icon,
  Trash,
  TrendingUpIcon,
  UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/dashboards',
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
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
});

type DashboardListItem = RouterOutputs['dashboard']['list'][number];

function canEditDashboard(role: DashboardListItem['role']) {
  return role === 'owner' || role === 'admin' || role === 'edit';
}

function canManageDashboard(role: DashboardListItem['role']) {
  return role === 'owner' || role === 'admin';
}

function DashboardCard({
  item,
  onDelete,
  onCopyToMine,
}: {
  item: DashboardListItem;
  onDelete: (id: string) => void;
  onCopyToMine: (id: string) => void;
}) {
  const visibleReports = item.reports.slice(
    0,
    item.reports.length > 6 ? 5 : 6,
  );
  const editable = canEditDashboard(item.role);
  const manageable = canManageDashboard(item.role);
  const isOwner = item.role === 'owner';
  const isShared = isOwner && item.sharedCount > 0;

  return (
    <Card hover>
      {isShared && (
        <button
          type="button"
          title={`Shared with ${item.sharedCount} ${item.sharedCount === 1 ? 'person' : 'people'}`}
          className="absolute right-12 top-2 z-10 flex h-8 w-8 items-center justify-center rounded text-green-600 hover:border hover:bg-green-600/10"
          onClick={(event) => {
            event.stopPropagation();
            pushModal('ManageDashboardAccess', {
              dashboardId: item.id,
              projectId: item.projectId,
            });
          }}
        >
          <UsersIcon size={16} />
        </button>
      )}
      <div>
        <Link
          from={Route.fullPath}
          to={`${item.id}`}
          className="flex flex-col p-4 @container"
        >
          <div className="col gap-2">
            <div className="font-medium">{item.name}</div>
            <div className="text-sm text-muted-foreground">
              {format(item.updatedAt, 'HH:mm · MMM d')}
            </div>
          </div>
          <div
            className={cn('mt-4 grid gap-2', 'grid-cols-1 @sm:grid-cols-2')}
          >
            {visibleReports.map((report) => {
              const Icon = {
                bar: BarChartHorizontalIcon,
                linear: LineChartIcon,
                pie: PieChartIcon,
                metric: HashIcon,
                map: Globe2Icon,
                histogram: BarChart3Icon,
                funnel: ConeIcon,
                area: AreaChartIcon,
                retention: ChartScatterIcon,
                conversion: TrendingUpIcon,
                sankey: GitBranchIcon,
              }[report.chartType];

              return (
                <div
                  className="row items-center gap-2 rounded-md bg-def-200 p-4 py-2"
                  key={report.id}
                >
                  <Icon size={24} />
                  <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                    {report.name}
                  </div>
                </div>
              );
            })}
            {item.reports.length > 6 && (
              <div className="row items-center gap-2 rounded-md bg-def-100 p-4 py-2">
                <PlusIcon size={24} />
                <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                  {item.reports.length - 5} more
                </div>
              </div>
            )}
          </div>
        </Link>
      </div>

      <CardActions>
        {editable && (
          <CardActionsItem className="w-full" asChild>
            <button
              type="button"
              onClick={() => {
                pushModal('EditDashboard', item);
              }}
            >
              <Pencil size={16} />
              Edit
            </button>
          </CardActionsItem>
        )}
        {manageable && (
          <CardActionsItem className="w-full" asChild>
            <button
              type="button"
              onClick={() => {
                pushModal('ManageDashboardAccess', {
                  dashboardId: item.id,
                  projectId: item.projectId,
                });
              }}
            >
              <Share2Icon size={16} />
              Share
            </button>
          </CardActionsItem>
        )}
        {!isOwner && (
          <CardActionsItem className="w-full" asChild>
            <button type="button" onClick={() => onCopyToMine(item.id)}>
              <CopyIcon size={16} />
              Clone
            </button>
          </CardActionsItem>
        )}
        {manageable && (
          <CardActionsItem className="w-full text-destructive" asChild>
            <button
              type="button"
              onClick={() => {
                showConfirm({
                  title: 'Delete dashboard',
                  text: 'Are you sure you want to delete this dashboard? All your reports will be deleted!',
                  onConfirm: () => onDelete(item.id),
                });
              }}
            >
              <Trash size={16} />
              Delete
            </button>
          </CardActionsItem>
        )}
      </CardActions>
    </Card>
  );
}

function DashboardSection({
  title,
  items,
  onDelete,
  onCopyToMine,
}: {
  title: string;
  items: DashboardListItem[];
  onDelete: (id: string) => void;
  onCopyToMine: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="mb-4 font-medium text-muted-foreground text-sm">
        {title}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <DashboardCard
            key={item.id}
            item={item}
            onDelete={onDelete}
            onCopyToMine={onCopyToMine}
          />
        ))}
      </div>
    </div>
  );
}

function Component() {
  const { organizationId, projectId } = Route.useParams();
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(
    trpc.dashboard.list.queryOptions({
      projectId,
    }),
  );
  const dashboards = query.data ?? [];
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
    }),
  );

  const copyToMine = useMutation(
    trpc.dashboard.copyToMine.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess(newDashboard) {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        toast('Success', {
          description: 'Dashboard cloned.',
        });
        router.navigate({
          to: '/$organizationId/$projectId/dashboards/$dashboardId',
          params: {
            organizationId,
            projectId,
            dashboardId: newDashboard.id,
          },
        });
      },
    }),
  );

  if (dashboards.length === 0) {
    return (
      <FullPageEmptyState title="No dashboards" icon={LayoutPanelTopIcon}>
        <p>You have not created any dashboards for this project yet</p>
        <Button
          onClick={() => pushModal('AddDashboard')}
          className="mt-14"
          icon={PlusIcon}
        >
          Create dashboard
        </Button>
      </FullPageEmptyState>
    );
  }

  const owned = dashboards.filter((item) => item.role === 'owner');
  const sharedWithMe = dashboards.filter(
    (item) => item.role === 'edit' || item.role === 'view',
  );
  const other = dashboards.filter((item) => item.role === 'admin');

  const onDelete = (id: string) => deletion.mutate({ id });
  const onCopyToMine = (id: string) => copyToMine.mutate({ id });

  return (
    <PageContainer>
      <PageHeader
        title="Dashboards"
        description="Access all your dashboards here"
        className="mb-8"
        actions={
          <Button icon={PlusIcon} onClick={() => pushModal('AddDashboard')}>
            <span className="max-sm:hidden">Create dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </Button>
        }
      />
      <DashboardSection
        title="Your dashboards"
        items={owned}
        onDelete={onDelete}
        onCopyToMine={onCopyToMine}
      />
      <DashboardSection
        title="Shared with you"
        items={sharedWithMe}
        onDelete={onDelete}
        onCopyToMine={onCopyToMine}
      />
      <DashboardSection
        title="Other dashboards in this project"
        items={other}
        onDelete={onDelete}
        onCopyToMine={onCopyToMine}
      />
    </PageContainer>
  );
}
