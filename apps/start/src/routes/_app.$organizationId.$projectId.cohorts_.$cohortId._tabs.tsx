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
        toast('Success', { description: 'Cohort refresh queued.' });
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
      toast.error('Failed to download cohort members');
    }
  }

  const { activeTab, tabs } = usePageTabs([
    {
      id: '/$organizationId/$projectId/cohorts/$cohortId',
      label: 'Overview',
    },
    { id: 'members', label: 'Members' },
    { id: 'events', label: 'Events' },
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
          <p className="text-sm">Cohort not found</p>
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
              Download
            </Button>
            {!c.isStatic && (
              <Button
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate({ cohortId: c.id })}
                size="sm"
                variant="outline"
              >
                <RefreshCwIcon className="mr-2 size-4" />
                Refresh
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
              Edit
            </Button>
            <Button
              onClick={() =>
                showConfirm({
                  title: 'Delete cohort',
                  text: `Are you sure you want to delete "${c.name}"? This action cannot be undone.`,
                  onConfirm: () => deleteMutation.mutate({ id: c.id }),
                })
              }
              size="sm"
              variant="outline"
            >
              <Trash2Icon className="mr-2 size-4" />
              Delete
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
                Static
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
