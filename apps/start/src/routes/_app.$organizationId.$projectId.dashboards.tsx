import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal, showConfirm } from '@/modals';
import { cn } from '@/utils/cn';
import { createProjectTitle } from '@/utils/title';
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
  Pencil,
  PieChartIcon,
  PlusIcon,
  Trash,
  TrendingUpIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/dashboards',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(i18n.t('dashboards.page_title')),
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

function Component() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
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
            label: t('dashboards.force_delete'),
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
        toast(t('dashboards.success'), {
          description: t('dashboards.delete_success'),
        });
      },
    }),
  );

  if (dashboards.length === 0) {
    return (
      <FullPageEmptyState title={t('dashboards.empty_title')} icon={LayoutPanelTopIcon}>
        <p>{t('dashboards.empty_description')}</p>
        <Button
          onClick={() => pushModal('AddDashboard')}
          className="mt-14"
          icon={PlusIcon}
        >
          {t('dashboards.create_dashboard')}
        </Button>
      </FullPageEmptyState>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('dashboards.page_title')}
        description={t('dashboards.page_description')}
        className="mb-8"
        actions={
          <Button icon={PlusIcon} onClick={() => pushModal('AddDashboard')}>
            <span className="max-sm:hidden">{t('dashboards.create_dashboard')}</span>
            <span className="sm:hidden">{t('dashboards.dashboard')}</span>
          </Button>
        }
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
                          {item.reports.length - 5} {t('dashboards.more')}
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
                    {t('dashboards.edit')}
                  </button>
                </CardActionsItem>
                <CardActionsItem className="w-full text-destructive" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      showConfirm({
                        title: t('dashboards.delete_dashboard'),
                        text: t('dashboards.delete_dashboard_confirm'),
                        onConfirm: () => deletion.mutate({ id: item.id }),
                      });
                    }}
                  >
                    <Trash size={16} />
                    {t('dashboards.delete')}
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
