import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { LockIcon, XIcon } from 'lucide-react';
import { ButtonContainer } from '@/components/button-container';
import CopyInput from '@/components/forms/copy-input';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import ConnectApp from '@/components/onboarding/connect-app';
import ConnectBackend from '@/components/onboarding/connect-backend';
import ConnectWeb from '@/components/onboarding/connect-web';
import { LinkButton } from '@/components/ui/button';
import { useClientSecret } from '@/hooks/use-client-secret';
import { useTRPC } from '@/integrations/trpc/react';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps/onboarding/$projectId/connect')({
  head: () => ({
    meta: [
      { title: createEntityTitle('Connect data', PAGE_TITLES.ONBOARDING) },
    ],
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
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId })
  );
  const client = project?.clients[0];
  const [secret] = useClientSecret();

  if (!client) {
    return (
      <FullPageEmptyState
        description="The project you are looking for does not exist. Please reload the page."
        icon={XIcon}
        title="No project found"
      />
    );
  }

  return (
    <div className="col gap-8 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 font-bold text-xl capitalize">
          <LockIcon className="size-4" />
          Credentials
        </div>
        <CopyInput label="Client ID" value={client.id} />
        <CopyInput label="Secret" value={secret} />
      </div>
      <div className="-mx-4 h-px bg-muted" />
      {project?.types?.map((type) => {
        const Component = {
          website: ConnectWeb,
          app: ConnectApp,
          backend: ConnectBackend,
        }[type];

        return <Component client={{ ...client, secret }} key={type} />;
      })}
      <ButtonContainer>
        <div />
        <LinkButton
          className="min-w-28 self-start"
          href={'/onboarding/$projectId/verify'}
          params={{ projectId }}
          size="lg"
        >
          Next
        </LinkButton>
      </ButtonContainer>
    </div>
  );
}
