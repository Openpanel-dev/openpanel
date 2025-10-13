import { ButtonContainer } from '@/components/button-container';
import CopyInput from '@/components/forms/copy-input';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import ConnectApp from '@/components/onboarding/connect-app';
import ConnectBackend from '@/components/onboarding/connect-backend';
import ConnectWeb from '@/components/onboarding/connect-web';
import {
  OnboardingDescription,
  OnboardingLayout,
} from '@/components/onboarding/onboarding-layout';
import { LinkButton } from '@/components/ui/button';
import { useClientSecret } from '@/hooks/use-client-secret';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { LockIcon, XIcon } from 'lucide-react';

export const Route = createFileRoute('/onboarding/$projectId/connect')({
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
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId }),
  );
  const client = project?.clients[0];
  const [secret] = useClientSecret();

  if (!client) {
    return (
      <FullPageEmptyState
        title="No project found"
        description="The project you are looking for does not exist. Please reload the page."
        icon={XIcon}
      />
    );
  }

  return (
    <OnboardingLayout
      title="Setup your data sources"
      description={
        <OnboardingDescription>
          Let&apos;s connect your data sources to OpenPanel
        </OnboardingDescription>
      }
    >
      <div className="flex flex-col gap-4 rounded-xl border p-4 md:p-6">
        <div className="flex items-center gap-2 text-2xl capitalize">
          <LockIcon />
          Credentials
        </div>
        <CopyInput label="Client ID" value={client.id} />
        <CopyInput label="Secret" value={secret} />
      </div>
      {project?.types?.map((type) => {
        const Component = {
          website: ConnectWeb,
          app: ConnectApp,
          backend: ConnectBackend,
        }[type];

        return <Component key={type} client={{ ...client, secret }} />;
      })}
      <ButtonContainer>
        <div />
        <LinkButton
          href={'/onboarding/$projectId/verify'}
          params={{ projectId }}
          size="lg"
          className="min-w-28 self-start"
        >
          Next
        </LinkButton>
      </ButtonContainer>
    </OnboardingLayout>
  );
}
