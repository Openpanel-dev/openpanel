import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import {
  DownloadIcon,
  PencilIcon,
  RefreshCwIcon,
  TargetIcon,
  Trash2Icon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { cohortMembersToCSV, downloadCSV } from '@/utils/csv-download';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/cohorts_/$cohortId/_tabs'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.cohort.get.queryOptions({ id: params.cohortId })
    );
  },
  pendingComponent: FullPageLoadingState,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.COHORT_DETAIL) }],
  }),
});

function Component() {
  const { t } = useTranslation();
  const router = useRouter();
  const { projectId, organizationId, cohortId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const cohort = useSuspenseQuery(
    trpc.cohort.get.queryOptions({ id: cohortId })
  );

  const deleteMutation = useMutation(
    trpc.cohort.delete.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.cohort.list.pathFilter());
        navigate({
          to: '/$organizationId/$projectId/cohorts',
          params: { organizationId, projectId },
        });
      },
      onError: handleError,
    })
  );

  const refreshMutation = useMutation(
    trpc.cohort.refresh.mutationOptions({
      onSuccess() {
        toast(t('cohorts.success'), {
          description: t('cohorts.cohort_refresh_queued'),
        });
        queryClient.invalidateQueries(trpc.cohort.get.pathFilter());
      },
      onError: handleError,
    })
  );

  async function handleDownload() {
    if (!c) return;
    try {
      const result = await queryClient.fetchQuery(
        trpc.cohort.exportProfiles.queryOptions({ cohortId })
      );
      const csv = cohortMembersToCSV(result.profileIds);
      downloadCSV(csv, `${c.name}-members.csv`);
    } catch {
      toast.error(t('cohorts.download_members_failed'));
    }
  }

  const { activeTab, tabs } = usePageTabs([
    {
      id: '/$organizationId/$projectId/cohorts/$cohortId',
      label: t('cohorts.overview'),
    },
    { id: 'members', label: t('cohorts.members') },
    { id: 'events', label: t('cohorts.events') },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  const c = cohort.data;

  if (!c) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <TargetIcon className="size-10 opacity-30" />
          <p className="text-sm">{t('cohorts.not_found')}</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="col">
      <PageHeader
        actions={
          <div className="row gap-2">
            <Button
              onClick={handleDownload}
              size="sm"
              variant="outline"
            >
              <DownloadIcon className="mr-2 size-4" />
              {t('cohorts.download')}
            </Button>
            {!c.isStatic && (
              <Button
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate({ cohortId: c.id })}
                size="sm"
                variant="outline"
              >
                <RefreshCwIcon className="mr-2 size-4" />
                {t('cohorts.refresh')}
              </Button>
            )}
            <Button
              onClick={() =>
                pushModal('EditCohort', {
                  id: c.id,
                  name: c.name,
                  description: c.description,
                  definition: c.definition as never,
                  isStatic: c.isStatic,
                })
              }
              size="sm"
              variant="outline"
            >
              <PencilIcon className="mr-2 size-4" />
              {t('cohorts.edit')}
            </Button>
            <Button
              onClick={() =>
                showConfirm({
                  title: t('cohorts.delete_cohort'),
                  text: t('cohorts.delete_named_confirm_description', {
                    name: c.name,
                  }),
                  onConfirm: () => deleteMutation.mutate({ id: c.id }),
                })
              }
              size="sm"
              variant="outline"
            >
              <Trash2Icon className="mr-2 size-4" />
              {t('cohorts.delete')}
            </Button>
          </div>
        }
        description={c.description || undefined}
        title={
          <div className="row min-w-0 items-center gap-3">
            <TargetIcon className="size-6 shrink-0" />
            <span className="truncate">{c.name}</span>
            {c.isStatic && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                {t('cohorts.static')}
              </span>
            )}
          </div>
        }
      />

      <Tabs
        className="mt-2 mb-8"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Outlet />
    </PageContainer>
  );
}
