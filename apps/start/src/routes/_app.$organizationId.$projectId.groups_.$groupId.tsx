import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Building2Icon, UsersIcon } from 'lucide-react';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';
import { WidgetHead, WidgetTitle } from '@/components/overview/overview-widget';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ProfileActivity } from '@/components/profiles/profile-activity';
import { Badge } from '@/components/ui/badge';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { Widget, WidgetBody } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDateTime } from '@/utils/date';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/groups_/$groupId'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.group.byId.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.group.metrics.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.group.activity.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.group.members.queryOptions({
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
  const { projectId, organizationId, groupId } = Route.useParams();
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

  const members = useSuspenseQuery(
    trpc.group.members.queryOptions({ id: groupId, projectId })
  );

  const g = group.data;
  const m = metrics.data?.[0];

  if (!g) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Building2Icon className="size-10 opacity-30" />
          <p className="text-sm">Group not found</p>
        </div>
      </PageContainer>
    );
  }

  const properties = g.properties as Record<string, unknown>;

  return (
    <PageContainer>
      <PageHeader
        title={
          <div className="row min-w-0 items-center gap-3">
            <Building2Icon className="size-6 shrink-0" />
            <span className="truncate">{g.name}</span>
            <Badge className="shrink-0" variant="outline">
              {g.type}
            </Badge>
          </div>
        }
      >
        <p className="font-mono text-muted-foreground text-sm">{g.id}</p>
      </PageHeader>

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

        {/* Members */}
        <div className="col-span-1">
          <Widget className="w-full">
            <WidgetHead>
              <WidgetTitle icon={UsersIcon}>Members</WidgetTitle>
            </WidgetHead>
            <WidgetBody>
              {members.data.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground text-sm">
                  No members found
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium text-muted-foreground">
                        Profile
                      </th>
                      <th className="py-2 text-right font-medium text-muted-foreground">
                        Events
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.data.map((member) => (
                      <tr
                        className="border-b last:border-0"
                        key={member.profileId}
                      >
                        <td className="py-2">
                          <Link
                            className="font-mono text-xs hover:underline"
                            params={{
                              organizationId,
                              projectId,
                              profileId: member.profileId,
                            }}
                            to="/$organizationId/$projectId/profiles/$profileId"
                          >
                            {member.profileId}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {member.eventCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </WidgetBody>
          </Widget>
        </div>
      </div>
    </PageContainer>
  );
}
