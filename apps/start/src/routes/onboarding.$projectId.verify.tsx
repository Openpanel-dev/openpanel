import { ButtonContainer } from '@/components/button-container';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { CurlPreview } from '@/components/onboarding/curl-preview';
import {
  OnboardingDescription,
  OnboardingLayout,
} from '@/components/onboarding/onboarding-layout';
import VerifyListener from '@/components/onboarding/onboarding-verify-listener';
import { LinkButton } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';

export const Route = createFileRoute('/onboarding/$projectId/verify')({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.event.events.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: events, refetch } = useQuery(
    trpc.event.events.queryOptions({ projectId }),
  );
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId }),
  );

  const isVerified = events && events.data.length > 0;

  if (!project) {
    return (
      <FullPageEmptyState title="Project not found" icon={BoxSelectIcon} />
    );
  }

  const client = project.clients[0];
  if (!client) {
    return <FullPageEmptyState title="Client not found" icon={BoxSelectIcon} />;
  }

  return (
    <OnboardingLayout
      title="Verify that you get events"
      description={
        <OnboardingDescription>
          Deploy your changes, as soon as you see events here, you&apos;re all
          set!
        </OnboardingDescription>
      }
    >
      <VerifyListener
        project={project}
        client={client}
        events={events?.data ?? []}
        onVerified={() => refetch()}
      />

      <CurlPreview project={project} />

      <ButtonContainer>
        <LinkButton
          href={`/onboarding/${project.id}/connect`}
          size="lg"
          className="min-w-28 self-start"
          variant={'secondary'}
        >
          Back
        </LinkButton>

        <div className="flex items-center gap-8">
          {!isVerified && (
            <Link
              to={'/$organizationId/$projectId'}
              params={{
                organizationId: project!.organizationId,
                projectId: project!.id,
              }}
              className=" text-muted-foreground underline"
            >
              Skip for now
            </Link>
          )}

          <LinkButton
            to={'/$organizationId/$projectId'}
            params={{
              organizationId: project!.organizationId,
              projectId: project!.id,
            }}
            size="lg"
            className={cn(
              'min-w-28 self-start',
              !isVerified && 'pointer-events-none select-none opacity-20',
            )}
          >
            Your dashboard
          </LinkButton>
        </div>
      </ButtonContainer>
    </OnboardingLayout>
  );
}
