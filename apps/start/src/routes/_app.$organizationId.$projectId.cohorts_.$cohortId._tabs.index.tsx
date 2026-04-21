import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { InfoIcon } from 'lucide-react';
import { CohortEventsChart } from '@/components/cohort/cohort-events-chart';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';
import { MostEvents } from '@/components/profiles/most-events';
import { PopularRoutes } from '@/components/profiles/popular-routes';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/cohorts_/$cohortId/_tabs/'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.cohort.eventsPerDay.queryOptions({
          projectId: params.projectId,
          cohortId: params.cohortId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.cohort.mostEvents.queryOptions({
          projectId: params.projectId,
          cohortId: params.cohortId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.cohort.popularRoutes.queryOptions({
          projectId: params.projectId,
          cohortId: params.cohortId,
        })
      ),
    ]);
  },
  pendingComponent: FullPageLoadingState,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.COHORT_DETAIL) }],
  }),
});

function Component() {
  const { projectId, cohortId } = Route.useParams();
  const trpc = useTRPC();

  const cohort = useSuspenseQuery(
    trpc.cohort.get.queryOptions({ id: cohortId })
  );
  const eventsPerDay = useSuspenseQuery(
    trpc.cohort.eventsPerDay.queryOptions({ projectId, cohortId })
  );
  const mostEvents = useSuspenseQuery(
    trpc.cohort.mostEvents.queryOptions({ projectId, cohortId })
  );
  const popularRoutes = useSuspenseQuery(
    trpc.cohort.popularRoutes.queryOptions({ projectId, cohortId })
  );

  const c = cohort.data;
  if (!c) return null;

  const notComputed = c.lastComputedAt === null;
  const isCapped = c.profileCount >= 10000;

  return (
    <div className="col gap-6">
      {notComputed && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 text-sm">
          <InfoIcon className="size-4 shrink-0" />
          <span>
            This cohort hasn&apos;t been computed yet. Membership will appear
            within a minute.
          </span>
        </div>
      )}

      {isCapped && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          <InfoIcon className="size-4 shrink-0" />
          <span>
            Capped at 10,000 members — consider narrowing the criteria.
          </span>
        </div>
      )}

      <div className="card grid grid-cols-1 overflow-hidden rounded-md md:grid-cols-3">
        <OverviewMetricCard
          data={[]}
          id="profileCount"
          isLoading={false}
          label="Members"
          metric={{ current: c.profileCount, previous: null }}
          unit=""
        />
        <OverviewMetricCard
          data={[]}
          id="lastComputedAt"
          isLoading={false}
          label="Last computed"
          metric={{
            current: c.lastComputedAt
              ? new Date(c.lastComputedAt).getTime()
              : 0,
            previous: null,
          }}
          unit="timeAgo"
        />
        <OverviewMetricCard
          data={[]}
          id="createdAt"
          isLoading={false}
          label="Created"
          metric={{
            current: new Date(c.createdAt).getTime(),
            previous: null,
          }}
          unit="timeAgo"
        />
      </div>

      <CohortEventsChart data={eventsPerDay.data} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <MostEvents data={mostEvents.data} />
        <PopularRoutes data={popularRoutes.data} />
      </div>
    </div>
  );
}
