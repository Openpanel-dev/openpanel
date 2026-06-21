import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { ProjectLink } from '@/components/links';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { cn } from '@/utils/cn';
import { cohortMembersToCSV, downloadCSV } from '@/utils/csv-download';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/cohorts',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.COHORTS) }],
  }),
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
  const { t } = useTranslation();
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
      onError: handleError,
      onSuccess() {
        query.refetch();
        toast(t('cohorts.success'), {
          description: t('cohorts.cohort_deleted'),
        });
      },
    }),
  );

  const refresh = useMutation(
    trpc.cohort.refresh.mutationOptions({
      onError: handleError,
      onSuccess() {
        query.refetch();
        toast(t('cohorts.success'), {
          description: t('cohorts.cohort_refresh_queued'),
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
      toast.error(t('cohorts.download_members_failed'));
    }
  }

  if (cohorts.length === 0) {
    return (
      <FullPageEmptyState title={t('cohorts.empty_title')} icon={UsersIcon}>
        <p>{t('cohorts.empty_description')}</p>
        <Button
          onClick={() => pushModal('AddCohort')}
          className="mt-14"
          icon={PlusIcon}
        >
          {t('cohorts.create_cohort')}
        </Button>
      </FullPageEmptyState>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('cohorts.title')}
        description={t('cohorts.description')}
        className="mb-8"
        actions={
          <Button icon={PlusIcon} onClick={() => pushModal('AddCohort')}>
            <span className="max-sm:hidden">{t('cohorts.create_cohort')}</span>
            <span className="sm:hidden">{t('cohorts.cohort')}</span>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {cohorts.map((cohort) => {
          const count =
            'currentCount' in cohort ? cohort.currentCount : cohort.profileCount;
          const displayCount = count ?? 0;
          return (
            <Card key={cohort.id} hover>
              <ProjectLink
                href={`/cohorts/${cohort.id}`}
                className="flex flex-col p-4 outline-none"
              >
                <div className="col gap-2">
                  <div className="font-medium">{cohort.name}</div>
                  {cohort.description && (
                    <div className="line-clamp-2 text-sm text-muted-foreground">
                      {cohort.description}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <UsersIcon size={14} />
                      <span>
                        {displayCount.toLocaleString()}{' '}
                        {t('cohorts.member_count', { count: displayCount })}
                      </span>
                    </div>
                    {cohort.lastComputedAt && (
                      <div className={cn('text-xs')}>
                        {t('cohorts.updated_at', {
                          date: format(cohort.lastComputedAt, 'MMM d, HH:mm'),
                        })}
                      </div>
                    )}
                  </div>
                  {cohort.isStatic && (
                    <div className="mt-1 inline-flex w-fit rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {t('cohorts.static')}
                    </div>
                  )}
                </div>
              </ProjectLink>

              <CardActions>
                <CardActionsItem className="w-full" asChild>
                  <button
                    type="button"
                    onClick={() => handleDownload(cohort.id, cohort.name)}
                  >
                    <DownloadIcon size={16} />
                    {t('cohorts.download')}
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
                      {t('cohorts.refresh')}
                    </button>
                  </CardActionsItem>
                )}
                <CardActionsItem className="w-full" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      pushModal('EditCohort', {
                        id: cohort.id,
                        name: cohort.name,
                        description: cohort.description,
                        definition: cohort.definition as never,
                        isStatic: cohort.isStatic,
                      });
                    }}
                  >
                    <PencilIcon size={16} />
                    {t('cohorts.edit')}
                  </button>
                </CardActionsItem>
                <CardActionsItem className="w-full text-destructive" asChild>
                  <button
                    type="button"
                    onClick={() => {
                      showConfirm({
                        title: t('cohorts.delete_cohort'),
                        text: t('cohorts.delete_confirm_description'),
                        onConfirm: () => deletion.mutate({ id: cohort.id }),
                      });
                    }}
                  >
                    <TrashIcon size={16} />
                    {t('cohorts.delete')}
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
