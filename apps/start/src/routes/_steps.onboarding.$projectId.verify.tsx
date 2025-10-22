import { ButtonContainer } from '@/components/button-container';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { CurlPreview } from '@/components/onboarding/curl-preview';
import VerifyListener from '@/components/onboarding/onboarding-verify-listener';
import { LinkButton } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/lib/utils';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { BoxSelectIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/_steps/onboarding/$projectId/verify')({
  head: () => ({
    meta: [{ title: createEntityTitle('Verify', PAGE_TITLES.ONBOARDING) }],
  }),
  beforeLoad: async ({ context }) => {
    if (!context.session.session) {
      throw redirect({ to: '/onboarding' });
    }
  },
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.project.getProjectWithClients.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const [isVerified, setIsVerified] = useState(false);
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: events, refetch } = useQuery(
    trpc.event.events.queryOptions({ projectId }),
  );
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId }),
  );

  useEffect(() => {
    if (events && events.data.length > 0) {
      setIsVerified(true);
    }
  }, [events]);

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
    <div className="p-4 col gap-8">
      <VerifyListener
        project={project}
        client={client}
        events={events?.data ?? []}
        onVerified={() => {
          refetch();
          setIsVerified(true);
        }}
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
    </div>
  );
}
