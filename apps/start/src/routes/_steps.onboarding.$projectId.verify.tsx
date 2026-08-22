import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';
import { ButtonContainer } from '@/components/button-container';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import VerifyListener from '@/components/onboarding/onboarding-verify-listener';
import { VerifyFaq } from '@/components/onboarding/verify-faq';
import { LinkButton } from '@/components/ui/button';
import { useEffect } from 'react';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/lib/utils';
import { op } from '@/utils/op';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps/onboarding/$projectId/verify')({
  head: () => ({
    meta: [{ title: createEntityTitle('Verify', PAGE_TITLES.ONBOARDING) }],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session?.session) {
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
  const queryClient = useQueryClient();
  const { data: events } = useQuery(
    trpc.event.events.queryOptions(
      { projectId },
      {
        // The live websocket below flips the verifier instantly; this poll is
        // only a fallback for when the socket can't connect.
        refetchInterval: 10_000,
      }
    )
  );
  // Refetch the event list the moment an event arrives instead of waiting for
  // the next poll — same channel the in-app live event feed uses.
  useWS(`/live/events/${projectId}`, () => {
    queryClient.invalidateQueries(
      trpc.event.events.queryFilter({ projectId })
    );
  });
  const isVerified = events?.data && events.data.length > 0;

  useEffect(() => {
    op.track('onboarding_verify_viewed', { projectId });
  }, [projectId]);

  useEffect(() => {
    if (isVerified) {
      op.track('onboarding_first_event_verified', { projectId });
    }
  }, [isVerified, projectId]);
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId })
  );

  if (!project) {
    return (
      <FullPageEmptyState icon={BoxSelectIcon} title="Project not found" />
    );
  }

  const client = project.clients[0];
  if (!client) {
    return <FullPageEmptyState icon={BoxSelectIcon} title="Client not found" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="col gap-8 p-4">
          <VerifyListener events={events?.data ?? []} />

          <VerifyFaq project={project} />
        </div>
      </div>
      <ButtonContainer className="mt-0 flex-shrink-0 border-t bg-background p-4">
        <LinkButton
          className="min-w-28 self-start"
          href={`/onboarding/${project.id}/connect`}
          size="lg"
          variant={'secondary'}
        >
          Back
        </LinkButton>

        <div className="flex items-center gap-8">
          {!isVerified && (
            <Link
              className="text-muted-foreground underline"
              params={{
                organizationId: project!.organizationId,
                projectId: project!.id,
              }}
              to={'/$organizationId/$projectId'}
            >
              Skip for now
            </Link>
          )}

          <LinkButton
            className={cn(
              'min-w-28 self-start',
              !isVerified && 'pointer-events-none select-none opacity-20'
            )}
            params={{
              organizationId: project!.organizationId,
              projectId: project!.id,
            }}
            size="lg"
            to={'/$organizationId/$projectId'}
          >
            Your dashboard
          </LinkButton>
        </div>
      </ButtonContainer>
    </div>
  );
}
