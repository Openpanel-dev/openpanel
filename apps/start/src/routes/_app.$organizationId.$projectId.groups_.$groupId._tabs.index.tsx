import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { GroupMemberGrowth } from '@/components/groups/group-member-growth';
import { GroupPlatforms } from '@/components/groups/group-platforms';
import { GroupTopMembers } from '@/components/groups/group-top-members';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';
import { WidgetHead } from '@/components/overview/overview-widget';
import { MostEvents } from '@/components/profiles/most-events';
import { PopularRoutes } from '@/components/profiles/popular-routes';
import { ProfileActivity } from '@/components/profiles/profile-activity';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';

/** Format a date as DD/MM/YYYY — what finance / support expect. */
function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const PLAN_LABEL: Record<string, string> = {
  solo: 'Solo',
  free: 'Solo',
  team: 'Team',
  'team-plus': 'Team+',
  team_plus: 'Team+',
  'team+': 'Team+',
  pro: 'Team Pro',
  'team-pro': 'Team Pro',
  team_pro: 'Team Pro',
  enterprise: 'Team Pro',
};

const SUBSCRIPTION_TERM_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  annual: 'Annual',
  yearly: 'Annual',
  '24m': '24 months',
  '24-months': '24 months',
  '24months': '24 months',
};

/** Curated + ordered fields for the Group Information grid. */
function buildGroupInfoRows(
  g: {
    id: string;
    name: string;
    createdAt: Date | string;
    properties: Record<string, unknown>;
  },
  memberCount: number,
) {
  const p = g.properties as Record<string, unknown>;
  const planRaw = (p.plan as string | undefined)?.trim() || '';
  const plan = planRaw ? PLAN_LABEL[planRaw.toLowerCase()] ?? planRaw : '—';

  const termRaw = (p.subscription_term as string | undefined)?.trim() || '';
  const term = termRaw
    ? SUBSCRIPTION_TERM_LABEL[termRaw.toLowerCase()] ?? termRaw
    : '—';

  const dealRaw = p.deal_amount as number | string | undefined;
  const deal =
    typeof dealRaw === 'number'
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: (p.currency as string) || 'USD',
          maximumFractionDigits: 0,
        }).format(dealRaw)
      : typeof dealRaw === 'string' && dealRaw.trim()
        ? dealRaw
        : '—';

  return [
    { name: 'name', value: g.name || '—' },
    { name: 'plan', value: plan },
    { name: 'teamMembers', value: memberCount.toLocaleString() },
    { name: 'owner', value: (p.owner_name as string) || '—' },
    { name: 'createdAt', value: formatDateShort(g.createdAt) },
    { name: 'subscriptionTerm', value: term },
    { name: 'dealAmount', value: deal },
    {
      name: 'renewalDate',
      value: formatDateShort(p.renewal_date as string | undefined),
    },
    {
      name: 'stripeId',
      value: (p.stripe_customer_id as string) || '—',
    },
  ];
}

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
      context.queryClient.prefetchQuery(
        context.trpc.group.platforms.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.group.topMembers.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
          take: 5,
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
              id="totalSessions"
              isLoading={false}
              label="Total Sessions"
              metric={{ current: m.totalSessions, previous: null }}
              unit=""
            />
            <OverviewMetricCard
              data={[]}
              id="totalSessionDuration"
              isLoading={false}
              label="Total Session Time"
              metric={{ current: m.totalSessionDuration, previous: null }}
              unit="min"
            />
          </div>
        </div>
      )}

      {/* Group Information — curated grid matching the fields Pin Drop
       * cares about for a customer record. Custom properties fall
       * through below the curated block for anything extra the Stripe
       * / RevenueCat webhook sends. Dates render DD/MM/YYYY for
       * consistency with finance/support expectations. */}
      <div className="col-span-1 md:col-span-2">
        <Widget className="w-full">
          <WidgetHead>
            <div className="title">Group Information</div>
          </WidgetHead>
          <KeyValueGrid
            className="border-0"
            columns={3}
            copyable
            data={buildGroupInfoRows(g, m?.uniqueProfiles ?? 0)}
          />
        </Widget>
      </div>

      {/* Platforms across the whole team */}
      <div className="col-span-1">
        <GroupPlatforms groupId={g.id} projectId={projectId} />
      </div>

      {/* Power users in the team */}
      <div className="col-span-1">
        <GroupTopMembers groupId={g.id} projectId={projectId} />
      </div>

      {/* Activity heatmap — full width now that the row above is paired */}
      <div className="col-span-1 md:col-span-2">
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
      <div className="col-span-1 md:col-span-2">
        <PopularRoutes data={popularRoutes.data} />
      </div>

    </div>
  );
}
