import FullPageLoadingState from '@/components/full-page-loading-state';
import FeedbackPrompt from '@/components/organization/feedback-prompt';
import SupporterPrompt from '@/components/organization/supporter-prompt';
import { LinkButton } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Outlet,
  createFileRoute,
  notFound,
  useLocation,
} from '@tanstack/react-router';
import { format } from 'date-fns';

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
  },
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
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

  return (
    <>
      {organization.subscriptionEndsAt && organization.isTrial && (
        <Alert
          title="Free trial"
          description={`Your organization is on a free trial. It ends on ${format(organization.subscriptionEndsAt, 'PPP')}`}
        >
          <LinkButton
            to="/$organizationId/billing"
            params={{
              organizationId: organizationId,
            }}
          >
            Upgrade from $2.5/month
          </LinkButton>
        </Alert>
      )}
      {organization.subscriptionEndsAt && organization.isWillBeCanceled && (
        <Alert
          title="Subscription will be canceled"
          description={`You have canceled your subscription. You can reactivate it by choosing a new plan below. It'll expire on ${format(organization.subscriptionEndsAt, 'PPP')}`}
        >
          <LinkButton
            to="/$organizationId/billing"
            params={{
              organizationId: organizationId,
            }}
          >
            Reactivate
          </LinkButton>
        </Alert>
      )}
      {organization.subscriptionCanceledAt && organization.isCanceled && (
        <Alert
          title="Subscription canceled"
          description={`Your subscription was canceled on ${format(organization.subscriptionCanceledAt, 'PPP')}`}
        >
          <LinkButton
            to="/$organizationId/billing"
            params={{
              organizationId: organizationId,
            }}
          >
            Reactivate
          </LinkButton>
        </Alert>
      )}
      {organization.subscriptionPeriodEventsCountExceededAt &&
        organization.isActive && (
          <Alert
            title="Events limit exceeded"
            description={`Your subscription has exceeded the limit on ${format(organization.subscriptionPeriodEventsCountExceededAt, 'PPP')}`}
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
