import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';
import {
  AreaChartIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  ChartScatterIcon,
  ConeIcon,
  Globe2Icon,
  HashIcon,
  LayoutPanelTopIcon,
  LineChartIcon,
  Pencil,
  PieChartIcon,
  PlusIcon,
  Trash,
  TrendingUpIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/dashboards',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.dashboard.list.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
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
        query.refetch();
        toast('Success', {
          description: 'Dashboard deleted.',
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

  return (
    <PageContainer>
      <PageHeader
        title="Dashboards"
        description="Access all your dashboards here"
        className="mb-8"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {dashboards.map((item) => {
          const visibleReports = item.reports.slice(
            0,
            item.reports.length > 6 ? 5 : 6,
          );
          return (
            <Card key={item.id} hover>
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
                    className={cn(
                      'mt-4 grid gap-2',
                      'grid-cols-1 @sm:grid-cols-2',
                    )}
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
                  {/* <span className="overflow-hidden text-ellipsis whitespace-nowrap  text-muted-foreground">
                    <span className="mr-2 font-medium">
                      {item.reports.length} reports
                    </span>
                    {item.reports.map((item) => item.name).join(', ')}
                  </span> */}
                </Link>
              </div>

              <CardActions>
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
                <CardActionsItem className="w-full text-destructive" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      deletion.mutate({
                        id: item.id,
                      });
                    }}
                  >
                    <Trash size={16} />
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
