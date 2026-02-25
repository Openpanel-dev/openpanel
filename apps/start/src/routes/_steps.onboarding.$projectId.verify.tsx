import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ButtonContainer } from '@/components/button-container';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { CurlPreview } from '@/components/onboarding/curl-preview';
import VerifyListener from '@/components/onboarding/onboarding-verify-listener';
import { LinkButton } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/lib/utils';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps/onboarding/$projectId/verify')({
  head: () => ({
    meta: [{ title: createEntityTitle('Verify', PAGE_TITLES.ONBOARDING) }],
  }),
  beforeLoad: async ({ context }) => {
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
  const [isVerified, setIsVerified] = useState(false);
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: events, refetch } = useQuery(
    trpc.event.events.queryOptions({ projectId })
  );
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId })
  );

  useEffect(() => {
    if (events && events.data.length > 0) {
      setIsVerified(true);
    }
  }, [events]);

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
    <div className="col gap-8 p-4">
      <VerifyListener
        client={client}
        events={events?.data ?? []}
        onVerified={() => {
          refetch();
          setIsVerified(true);
        }}
        project={project}
      />

      <CurlPreview project={project} />

      <ButtonContainer>
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
