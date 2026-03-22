import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { GroupMemberGrowth } from '@/components/groups/group-member-growth';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';
import { WidgetHead } from '@/components/overview/overview-widget';
import { MostEvents } from '@/components/profiles/most-events';
import { PopularRoutes } from '@/components/profiles/popular-routes';
import { ProfileActivity } from '@/components/profiles/profile-activity';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDateTime } from '@/utils/date';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/groups_/$groupId/_tabs/'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.group.activity.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
    ]);
  },
  pendingComponent: FullPageLoadingState,
  head: () => ({
    meta: [{ title: createProjectTitle('Group') }],
  }),
});

function Component() {
  const { projectId, groupId } = Route.useParams();
  const trpc = useTRPC();

  const group = useSuspenseQuery(
    trpc.group.byId.queryOptions({ id: groupId, projectId })
  );
  const metrics = useSuspenseQuery(
    trpc.group.metrics.queryOptions({ id: groupId, projectId })
  );
  const activity = useSuspenseQuery(
    trpc.group.activity.queryOptions({ id: groupId, projectId })
  );
  const mostEvents = useSuspenseQuery(
    trpc.group.mostEvents.queryOptions({ id: groupId, projectId })
  );
  const popularRoutes = useSuspenseQuery(
    trpc.group.popularRoutes.queryOptions({ id: groupId, projectId })
  );
  const memberGrowth = useSuspenseQuery(
    trpc.group.memberGrowth.queryOptions({ id: groupId, projectId })
  );

  const g = group.data;
  const m = metrics.data;

  if (!g) {
    return null;
  }

  const properties = g.properties as Record<string, unknown>;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Metrics */}
      {m && (
        <div className="col-span-1 md:col-span-2">
          <div className="card grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-4">
            <OverviewMetricCard
              data={[]}
              id="totalEvents"
              isLoading={false}
              label="Total Events"
              metric={{ current: m.totalEvents, previous: null }}
              unit=""
            />
            <OverviewMetricCard
              data={[]}
              id="uniqueMembers"
              isLoading={false}
              label="Unique Members"
              metric={{ current: m.uniqueProfiles, previous: null }}
              unit=""
            />
            <OverviewMetricCard
              data={[]}
              id="firstSeen"
              isLoading={false}
              label="First Seen"
              metric={{
                current: m.firstSeen ? new Date(m.firstSeen).getTime() : 0,
                previous: null,
              }}
              unit="timeAgo"
            />
            <OverviewMetricCard
              data={[]}
              id="lastSeen"
              isLoading={false}
              label="Last Seen"
              metric={{
                current: m.lastSeen ? new Date(m.lastSeen).getTime() : 0,
                previous: null,
              }}
              unit="timeAgo"
            />
          </div>
        </div>
      )}

      {/* Properties */}
      <div className="col-span-1 md:col-span-2">
        <Widget className="w-full">
          <WidgetHead>
            <div className="title">Group Information</div>
          </WidgetHead>
          <KeyValueGrid
            className="border-0"
            columns={3}
            copyable
            data={[
              { name: 'id', value: g.id },
              { name: 'name', value: g.name },
              { name: 'type', value: g.type },
              {
                name: 'createdAt',
                value: formatDateTime(new Date(g.createdAt)),
              },
              ...Object.entries(properties)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([k, v]) => ({
                  name: k,
                  value: String(v),
                })),
            ]}
          />
        </Widget>
      </div>

      {/* Activity heatmap */}
      <div className="col-span-1">
        <ProfileActivity data={activity.data} />
      </div>

      {/* New members last 30 days */}
      <div className="col-span-1">
        <GroupMemberGrowth data={memberGrowth.data} />
      </div>

      {/* Top events */}
      <div className="col-span-1">
        <MostEvents data={mostEvents.data} />
      </div>

      {/* Popular routes */}
      <div className="col-span-1">
        <PopularRoutes data={popularRoutes.data} />
      </div>

    </div>
  );
}
