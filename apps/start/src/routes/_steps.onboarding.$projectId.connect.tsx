import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { useEffect } from 'react';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { ClientCredentials } from '@/components/onboarding/client-credentials';
import {
  FirstEventStatus,
  useFirstEvents,
} from '@/components/onboarding/first-event-status';
import { InstallGuide } from '@/components/onboarding/install-guide';
import type { SnippetContext } from '@/components/onboarding/install-snippets';
import { InstallTroubleshooting } from '@/components/onboarding/install-troubleshooting';
import { McpConnect } from '@/components/onboarding/mcp-connect';
import { OnboardingHeading } from '@/components/onboarding/onboarding-heading';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LinkButton } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import {
  isRealClientSecret,
  useClientSecret,
  useMcpToken,
} from '@/hooks/use-client-secret';
import { useTRPC } from '@/integrations/trpc/react';
import { op } from '@/utils/op';
import { isSignedIn } from '@/utils/route-session';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps/onboarding/$projectId/connect')({
  head: () => ({
    meta: [{ title: createEntityTitle('Install', PAGE_TITLES.ONBOARDING) }],
  }),
  beforeLoad: async ({ context }) => {
    if (!(await isSignedIn(context))) {
      throw redirect({ to: '/onboarding' });
    }
  },
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.project.getProjectWithClients.queryOptions({
        projectId: params.projectId,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { apiUrl, isSelfHosted } = useAppContext();
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId })
  );
  const client = project?.clients.find(
    (candidate) => candidate.type === 'write'
  );
  const [secret] = useClientSecret();
  const [mcpToken] = useMcpToken();
  const { events, isVerified } = useFirstEvents(projectId);

  useEffect(() => {
    op.track('onboarding_connect_viewed', { projectId });
  }, [projectId]);

  if (!(project && client)) {
    return (
      <FullPageEmptyState
        description="The project you are looking for does not exist. Please reload the page."
        icon={XIcon}
        title="No project found"
      />
    );
  }

  // Secrets only exist in the browser session right after creation (the
  // server stores hashes). Snippets fall back to a placeholder without them.
  const context: SnippetContext = {
    clientId: client.id,
    clientSecret: isRealClientSecret(secret) ? secret : null,
    apiUrl: isSelfHosted ? apiUrl : null,
  };
  const dashboard = {
    to: '/$organizationId/$projectId',
    params: { organizationId: project.organizationId, projectId: project.id },
  } as const;

  // One DOM copy of the sidebar: it sits under the heading on small screens
  // and becomes the sticky right column on large ones.
  const sidebarPlacement =
    'col gap-5 lg:col-start-2 lg:row-span-4 lg:row-start-1';

  return (
    <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-x-12">
      <OnboardingHeading
        className="lg:col-start-1"
        description={
          <>
            Add the snippet to{' '}
            <strong className="text-foreground">{project.name}</strong> and we
            confirm the first event right here. Your keys stay on the side; you
            can also do this later from the dashboard.
          </>
        }
        title="Install OpenPanel"
      />
      <aside className={sidebarPlacement}>
        <FirstEventStatus events={events}>
          {isVerified && (
            <LinkButton className="w-full" size="lg" {...dashboard}>
              Open dashboard
            </LinkButton>
          )}
        </FirstEventStatus>
        <ClientCredentials
          clientId={client.id}
          clientSecret={context.clientSecret}
          mcpToken={mcpToken}
        />
        <McpConnect
          apiUrl={apiUrl}
          mcpToken={mcpToken}
          organizationId={project.organizationId}
          projectId={project.id}
        />
        {!isVerified && (
          <Link
            className="text-center text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => op.track('onboarding_skipped', { projectId })}
            {...dashboard}
          >
            Skip for now, I will install later
          </Link>
        )}
      </aside>
      <div className="lg:col-start-1">
        <InstallGuide
          context={context}
          projectId={project.id}
          projectName={project.name}
          projectTypes={project.types}
        />
      </div>
      <Accordion
        className="rounded-xl border px-5 lg:col-start-1"
        collapsible
        type="single"
      >
        <AccordionItem value="troubleshooting">
          <AccordionTrigger>Not seeing events?</AccordionTrigger>
          <AccordionContent>
            <InstallTroubleshooting context={context} project={project} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="row items-center justify-between gap-4 border-t pt-8 lg:col-start-1">
        <span className="text-muted-foreground">
          {isVerified
            ? 'You are all set.'
            : 'The dashboard fills up as soon as events arrive.'}
        </span>
        <LinkButton
          size="xl"
          variant={isVerified ? 'default' : 'outline'}
          {...dashboard}
        >
          Open dashboard
        </LinkButton>
      </div>
    </div>
  );
}
