import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { CopyIcon, DownloadIcon, LockIcon, XIcon } from 'lucide-react';
import { ButtonContainer } from '@/components/button-container';
import CopyInput from '@/components/forms/copy-input';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import ConnectWeb from '@/components/onboarding/connect-web';
import { Button, LinkButton } from '@/components/ui/button';
import { isRealClientSecret, useClientSecret } from '@/hooks/use-client-secret';
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

  // The secret only exists in this browser session right after creation (we
  // store a hash server-side). Never derive the MCP token — or print secret
  // lines — from the placeholder: that produces valid-looking broken values.
  const hasSecret = isRealClientSecret(secret);
  const mcpToken = hasSecret ? btoa(`${client.id}:${secret}`) : null;
  const credentials = [
    `CLIENT_ID=${client.id}`,
    hasSecret && `CLIENT_SECRET=${secret}`,
    mcpToken && `MCP_TOKEN=${mcpToken}`,
  ]
    .filter(Boolean)
    .join('\n');
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
                  Copy all
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
            <div className="col gap-3">
              <CopyInput label="Client ID" value={client.id} />
              {hasSecret && <CopyInput label="Client secret" value={secret} />}
              {mcpToken && (
                <div className="w-full min-w-0">
                  <CopyInput label="MCP token" value={mcpToken} />
                  <p className="mt-1 text-muted-foreground text-sm">
                    Authenticates the MCP server (base64-encoded client ID and
                    secret).
                  </p>
                </div>
              )}
              {!hasSecret && (
                <p className="text-muted-foreground text-sm">
                  Your client secret (and the MCP token derived from it) is only
                  shown once, right after the client is created. If you need it
                  again, create a new client under Settings → Clients.
                </p>
              )}
            </div>
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
