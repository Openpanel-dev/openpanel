import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { CopyIcon, DownloadIcon, LockIcon, XIcon } from 'lucide-react';
import { ButtonContainer } from '@/components/button-container';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import ConnectWeb from '@/components/onboarding/connect-web';
import Syntax from '@/components/syntax';
import { Button, LinkButton } from '@/components/ui/button';
import { useClientSecret } from '@/hooks/use-client-secret';
import { useTRPC } from '@/integrations/trpc/react';
import { clipboard } from '@/utils/clipboard';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps/onboarding/$projectId/connect')({
  head: () => ({
    meta: [
      { title: createEntityTitle('Connect data', PAGE_TITLES.ONBOARDING) },
    ],
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

  const credentials = `CLIENT_ID=${client.id}\nCLIENT_SECRET=${secret}`;
  const download = () => {
    const blob = new Blob([credentials], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'credentials.txt';
    a.click();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="col gap-4 p-4">
          <div className="col gap-2">
            <div className="row items-center justify-between gap-4">
              <div className="flex items-center gap-2 font-bold text-xl capitalize">
                <LockIcon className="size-4" />
                Client credentials
              </div>
              <div className="row gap-2">
                <Button
                  icon={CopyIcon}
                  onClick={() => clipboard(credentials)}
                  variant="outline"
                >
                  Copy
                </Button>
                <Button
                  icon={DownloadIcon}
                  onClick={() => download()}
                  variant="outline"
                >
                  Save
                </Button>
              </div>
            </div>
            <Syntax
              className="border"
              code={`CLIENT_ID=${client.id}\nCLIENT_SECRET=${secret}`}
              copyable={false}
              language="bash"
            />
          </div>
          <div className="-mx-4 h-px bg-muted" />
          <ConnectWeb client={{ ...client, secret }} />
        </div>
      </div>
      <ButtonContainer className="mt-0 flex-shrink-0 border-t bg-background p-4">
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
