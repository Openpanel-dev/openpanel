import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { cn } from '@/utils/cn';
import { cohortMembersToCSV, downloadCSV } from '@/utils/csv-download';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { DownloadIcon, PencilIcon, PlusIcon, RefreshCwIcon, TrashIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/cohorts',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.COHORTS || 'Cohorts'),
        },
      ],
    };
  },
  async loader({ context, params }) {
    await context.queryClient.prefetchQuery(
      context.trpc.cohort.list.queryOptions({
        projectId: params.projectId,
        includeCount: true,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.cohort.list.queryOptions({
      projectId,
      includeCount: true,
    }),
  );
  const cohorts = query.data ?? [];

  const deletion = useMutation(
    trpc.cohort.delete.mutationOptions({
      onError: handleErrorToastOptions(),
      onSuccess() {
        query.refetch();
        toast('Success', {
          description: 'Cohort deleted.',
        });
      },
    }),
  );

  const queryClient = useQueryClient();

  async function handleDownload(cohortId: string, cohortName: string) {
    try {
      const result = await queryClient.fetchQuery(
        trpc.cohort.exportProfiles.queryOptions({ cohortId }),
      );
      const csv = cohortMembersToCSV(result.profileIds);
      downloadCSV(csv, `${cohortName}-members.csv`);
    } catch {
      toast.error('Failed to download cohort members');
    }
  }

  const refresh = useMutation(
    trpc.cohort.refresh.mutationOptions({
      onError: handleErrorToastOptions(),
      onSuccess() {
        query.refetch();
        toast('Success', {
          description: 'Cohort refreshed.',
        });
      },
    }),
  );

  if (cohorts.length === 0) {
    return (
      <FullPageEmptyState title="No cohorts" icon={UsersIcon}>
        <p>You have not created any cohorts for this project yet</p>
        <Button
          onClick={() => pushModal('AddCohort')}
          className="mt-14"
          icon={PlusIcon}
        >
          Create cohort
        </Button>
      </FullPageEmptyState>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Cohorts"
        description="Create and manage user segments based on events and properties"
        className="mb-8"
        actions={
          <Button icon={PlusIcon} onClick={() => pushModal('AddCohort')}>
            <span className="max-sm:hidden">Create cohort</span>
            <span className="sm:hidden">Cohort</span>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {cohorts.map((cohort) => {
          const count = 'currentCount' in cohort ? cohort.currentCount : cohort.profileCount;
          const displayCount = count ?? 0;
          return (
            <Card key={cohort.id} hover>
              <div className="flex flex-col p-4">
                <div className="col gap-2">
                  <div className="font-medium">{cohort.name}</div>
                  {cohort.description && (
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      {cohort.description}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <UsersIcon size={14} />
                      <span>{displayCount.toLocaleString()} {displayCount === 1 ? 'member' : 'members'}</span>
                    </div>
                    {cohort.lastComputedAt && (
                      <div className={cn('text-xs')}>
                        Updated {format(cohort.lastComputedAt, 'MMM d, HH:mm')}
                      </div>
                    )}
                  </div>
                  {cohort.isStatic && (
                    <div className="mt-1 inline-flex w-fit rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      Static
                    </div>
                  )}
                  {cohort.computeOnDemand && (
                    <div className="mt-1 inline-flex w-fit rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      On-demand
                    </div>
                  )}
                </div>
              </div>

              <CardActions>
                <CardActionsItem className="w-full" asChild>
                  <button
                    type="button"
                    onClick={() => handleDownload(cohort.id, cohort.name)}
                  >
                    <DownloadIcon size={16} />
                    Download
                  </button>
                </CardActionsItem>
                {!cohort.isStatic && (
                  <CardActionsItem className="w-full" asChild>
                    <button
                      type="button"
                      onClick={() => {
                        refresh.mutate({ cohortId: cohort.id });
                      }}
                    >
                      <RefreshCwIcon size={16} />
                      Refresh
                    </button>
                  </CardActionsItem>
                )}
                <CardActionsItem className="w-full" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      pushModal('EditCohort', cohort);
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
                        title: 'Delete cohort',
                        text: 'Are you sure you want to delete this cohort? This action cannot be undone.',
                        onConfirm: () => deletion.mutate({ id: cohort.id }),
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
