import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import FeedbackPrompt from '@/components/organization/feedback-prompt';
import SupporterPrompt from '@/components/organization/supporter-prompt';
import YearlySwitchPrompt from '@/components/organization/yearly-switch-prompt';
import { LinkButton } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { getSubscriptionStateMeta } from '@openpanel/payments/subscription-state-meta';
import { subscriptionBlocksDashboard } from '@openpanel/payments/subscription-state';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Outlet,
  createFileRoute,
  notFound,
  useLocation,
  useMatches,
} from '@tanstack/react-router';
import { format } from 'date-fns';
import { Building2Icon } from 'lucide-react';

const IGNORE_ORGANIZATION_IDS = ['.well-known', 'onboarding', 'assets'];

const FILE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'ico',
  'js',
  'xml',
  'txt',
  'json',
  'webmanifest',
];

const isStaticFile = (path: string) => {
  return FILE_EXTENSIONS.some((extension) => path.endsWith(`.${extension}`));
};

export const Route = createFileRoute('/_app/$organizationId')({
  component: Component,
  beforeLoad: async ({ context, params }) => {
    if (IGNORE_ORGANIZATION_IDS.includes(params.organizationId)) {
      throw notFound();
    }
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }
    // Single source of truth for "can this user see this org?". myAccess is
    // membership-exempt and returns null for non-members (and non-existent
    // orgs), which we surface as a not-found page. Real errors (network/500)
    // reject and fall through to the errorComponent. Runs before child routes,
    // so it short-circuits settings/index/billing/members/project.
    const access = await context.queryClient.fetchQuery(
      context.trpc.organization.myAccess.queryOptions({
        organizationId: params.organizationId,
      }),
    );
    if (access === null) {
      throw notFound();
    }
  },
  loader: async ({ context, params }) => {
    // myAccess is already warmed in beforeLoad; only organization.get remains.
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
  notFoundComponent: () => (
    <FullPageEmptyState
      title="Workspace not found"
      description="This workspace doesn't exist or you don't have access to it."
      icon={Building2Icon}
      className="min-h-[calc(100vh-4rem)]"
    >
      <LinkButton href="/">Go to home</LinkButton>
    </FullPageEmptyState>
  ),
});

function Alert({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  const location = useLocation();

  // Hide on billing page
  if (location.pathname.match(/\/.+\/billing/)) {
    return null;
  }

  return (
    <div className={cn('p-4 lg:p-8 bg-card border-b col gap-1', className)}>
      <div className="text-lg font-medium">{title}</div>
      <div className="mb-1">{description}</div>
      <div className="row gap-2">{children}</div>
    </div>
  );
}

function Component() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const { data: organization } = useSuspenseQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    }),
  );

  const stateMeta = getSubscriptionStateMeta(organization.subscriptionState, {
    endsAt: organization.subscriptionEndsAt,
    canceledAt: organization.subscriptionCanceledAt,
    resumesAt: organization.subscriptionResumesAt,
  });

  // Project routes show the full-screen BillingPrompt for blocking states;
  // don't stack the (sometimes contradicting) banner on top. Org-level pages
  // have no prompt, so the banner still shows there.
  const isProjectRoute = useMatches({
    select: (matches) =>
      matches.some(
        (match) => match.routeId === '/_app/$organizationId/$projectId',
      ),
  });
  const hideBannerForPrompt =
    isProjectRoute &&
    subscriptionBlocksDashboard(organization.subscriptionState);

  const location = useLocation();
  const isBillingPage = /\/.+\/billing/.test(location.pathname);

  return (
    <>
      {!stateMeta.banner && !isBillingPage && (
        <YearlySwitchPrompt organization={organization} />
      )}
      {stateMeta.banner && !hideBannerForPrompt && (
        <Alert
          title={stateMeta.banner.title}
          description={stateMeta.banner.description}
        >
          <LinkButton
            to="/$organizationId/billing"
            params={{
              organizationId: organizationId,
            }}
          >
            {stateMeta.banner.cta}
          </LinkButton>
        </Alert>
      )}
      {organization.isActive &&
        !organization.isExceeded &&
        organization.subscriptionPeriodEventsLimit > 0 &&
        organization.subscriptionPeriodEventsCount >=
          organization.subscriptionPeriodEventsLimit * 0.8 && (
          <Alert
            title="Approaching your events limit"
            description={`You've used ${Math.round((organization.subscriptionPeriodEventsCount / organization.subscriptionPeriodEventsLimit) * 100)}% of your ${organization.subscriptionPeriodEventsLimit.toLocaleString()} monthly events. If you go over, we keep collecting your events but charts pause until you upgrade.`}
          >
            <LinkButton
              to="/$organizationId/billing"
              params={{
                organizationId: organizationId,
              }}
            >
              See plans
            </LinkButton>
          </Alert>
        )}
      {organization.subscriptionPeriodEventsCountExceededAt &&
        organization.isActive &&
        organization.isExceeded && (
          <Alert
            title="Events limit exceeded"
            description={`You hit your monthly events limit on ${format(organization.subscriptionPeriodEventsCountExceededAt, 'PPP')}. We're still collecting your events — nothing is lost — but charts won't show new data until you upgrade or your next cycle starts.`}
          >
            <LinkButton
              to="/$organizationId/billing"
              params={{
                organizationId: organizationId,
              }}
            >
              Upgrade now
            </LinkButton>
          </Alert>
        )}
      <Outlet />
      <SupporterPrompt />
      <FeedbackPrompt />
    </>
  );
}
