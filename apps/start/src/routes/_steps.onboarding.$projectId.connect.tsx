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
import { OnboardingHeading } from '@/components/onboarding/onboarding-heading';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LinkButton } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { isRealClientSecret, useClientSecret } from '@/hooks/use-client-secret';
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
  const client = project?.clients[0];
  const [secret] = useClientSecret();
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

  // The secret only exists in this browser session right after creation (the
  // server stores a hash). Snippets fall back to a placeholder without it.
  const context: SnippetContext = {
    clientId: client.id,
    clientSecret: isRealClientSecret(secret) ? secret : null,
    apiUrl: isSelfHosted ? apiUrl : null,
  };
  const dashboard = {
    to: '/$organizationId/$projectId',
    params: { organizationId: project.organizationId, projectId: project.id },
  } as const;

  return (
    <div className="col gap-10">
      <OnboardingHeading
        description={
          <>
            Add the snippet to{' '}
            <strong className="text-foreground">{project.name}</strong> and we
            confirm the first event right here. You can also do this later from
            the dashboard.
          </>
        }
        title="Install OpenPanel"
      />

      <FirstEventStatus events={events}>
        {isVerified && (
          <LinkButton size="xl" {...dashboard}>
            Open dashboard
          </LinkButton>
        )}
      </FirstEventStatus>

      <InstallGuide
        context={context}
        projectId={project.id}
        projectName={project.name}
        projectTypes={project.types}
      />

      <Accordion className="rounded-xl border px-5" collapsible type="single">
        <AccordionItem value="credentials">
          <AccordionTrigger>Your credentials</AccordionTrigger>
          <AccordionContent>
            <ClientCredentials
              clientId={client.id}
              clientSecret={context.clientSecret}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="troubleshooting">
          <AccordionTrigger>Not seeing events?</AccordionTrigger>
          <AccordionContent>
            <InstallTroubleshooting context={context} project={project} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="row items-center justify-between gap-4 border-t pt-8">
        {isVerified ? (
          <>
            <span className="text-muted-foreground">You are all set.</span>
            <LinkButton size="xl" {...dashboard}>
              Open dashboard
            </LinkButton>
          </>
        ) : (
          <>
            <Link
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => op.track('onboarding_skipped', { projectId })}
              {...dashboard}
            >
              Skip for now, I will install later
            </Link>
            <LinkButton size="xl" variant="outline" {...dashboard}>
              Open dashboard
            </LinkButton>
          </>
        )}
      </div>
    </div>
  );
}
