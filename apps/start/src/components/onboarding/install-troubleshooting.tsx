import type { IServiceProjectWithClients } from '@openpanel/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { curlSnippet, type SnippetContext } from './install-snippets';
import { setLaunchedQuestion } from '@/components/chat/chat-launch';
import CopyInput from '@/components/forms/copy-input';
import { WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import Syntax from '@/components/syntax';
import { buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { trackFunnel } from '@/utils/funnel-tracking';

const TEST_EVENT_NAME = 'openpanel_test_event';

// The assistant can fetch the site, read the snippet and compare it with the
// project's client and allowed origins, so it finds most causes by itself.
function diagnoseQuestion(project: IServiceProjectWithClients): string {
  if (project.domain) {
    return `No events have arrived for ${project.domain} after installing OpenPanel. Diagnose the install.`;
  }
  const kinds = project.types.length > 0 ? project.types.join(' and ') : 'app';
  return `No events have arrived from my ${kinds} project after installing OpenPanel. Check what has reached the project and what could block events.`;
}

function normalizeOrigins(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) =>
      value === '*' || /^https?:\/\//.test(value) ? value : `https://${value}`
    );
}

/** A quiet link under the listener that opens the troubleshooting checks. */
export function InstallTroubleshootingDialog({
  project,
  context,
}: {
  project: IServiceProjectWithClients;
  context: SnippetContext;
}) {
  return (
    <Dialog
      onOpenChange={(open) =>
        trackFunnel('onboarding_troubleshooting_toggled', {
          projectId: project.id,
          open,
        })
      }
    >
      <DialogTrigger className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline">
        I'm not receiving events
      </DialogTrigger>
      <DialogPortal>
        <DialogContent className="sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>Not seeing events?</DialogTitle>
            <DialogDescription>
              The checks that solve most installs, in the order they usually
              apply.
            </DialogDescription>
          </DialogHeader>
          <InstallTroubleshooting context={context} project={project} />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

/** The checks that resolve most "no events" reports, in the order they usually apply. */
export function InstallTroubleshooting({
  project,
  context,
}: {
  project: IServiceProjectWithClients;
  context: SnippetContext;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const updateProject = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          })
        );
        toast.success('Allowed domains updated');
      },
    })
  );
  const isWebsite = project.types.includes('website');

  return (
    <ol className="col gap-6">
      <li className="row flex-wrap items-center justify-between gap-3 rounded-xl bg-def-200 p-4 dark:bg-def-300">
        <div className="col gap-0.5">
          <div className="font-medium">Let the assistant find it</div>
          <p className="text-muted-foreground text-sm">
            It fetches your site, reads the snippet and checks it against this
            project's keys and allowed domains.
          </p>
        </div>
        <Link
          className={cn(buttonVariants({ size: 'default' }))}
          onClick={() => {
            setLaunchedQuestion(diagnoseQuestion(project));
            trackFunnel('onboarding_assistant_opened', {
              projectId: project.id,
              hasDomain: Boolean(project.domain),
            });
          }}
          params={{
            organizationId: project.organizationId,
            projectId: project.id,
          }}
          search={{ hint: { page: 'onboarding' } }}
          to="/$organizationId/$projectId/chat"
        >
          <SparklesIcon className="mr-2 size-4" />
          Diagnose with the assistant
        </Link>
      </li>
      <li className="col gap-2">
        <div className="font-medium">
          1. Did the page or app actually load with the snippet?
        </div>
        <p className="text-muted-foreground">
          Events are sent when a screen is viewed. Deploy or run the code, then
          open it once and reload this page. Ad blockers can also stop the
          request; try an incognito window without extensions.
        </p>
      </li>
      <li className="col gap-3">
        <div className="font-medium">
          2. Is the client ID the one for this project?
        </div>
        <CopyInput label="Client ID" value={context.clientId} />
      </li>
      {isWebsite && (
        <li className="col gap-3">
          <div className="font-medium">3. Is your domain allowed?</div>
          <p className="text-muted-foreground">
            Browser events are accepted only from these origins. Add every
            domain your site runs on, including localhost while testing.
          </p>
          <WithLabel label="Allowed domains">
            <TagInput
              onChange={(values) => {
                const cors = normalizeOrigins(values);
                trackFunnel('onboarding_allowed_domains_updated', {
                  projectId: project.id,
                  count: cors.length,
                  wildcard: cors.includes('*'),
                });
                updateProject.mutate({ id: project.id, cors });
              }}
              placeholder="Add a domain and press Enter"
              renderTag={(tag) => (tag === '*' ? 'Any domain' : tag)}
              value={project.cors ?? []}
            />
          </WithLabel>
        </li>
      )}
      <li className="col gap-3">
        <div className="font-medium">
          {isWebsite ? '4.' : '3.'} Send a test event from your terminal
        </div>
        <p className="text-muted-foreground">
          This bypasses your code entirely. If it shows up above, the project is
          fine and the problem is in the integration.
        </p>
        <Syntax
          code={curlSnippet(context, TEST_EVENT_NAME)}
          language="bash"
          onCopy={() =>
            trackFunnel('onboarding_test_curl_copied', {
              projectId: project.id,
            })
          }
          wrapLines
        />
      </li>
      <li className="text-muted-foreground">
        Still stuck? Write to{' '}
        <a
          className="underline"
          href="mailto:hello@openpanel.dev"
          onClick={() =>
            trackFunnel('onboarding_support_link_clicked', {
              projectId: project.id,
              target: 'email',
            })
          }
        >
          hello@openpanel.dev
        </a>{' '}
        or join the{' '}
        <a
          className="underline"
          href="https://go.openpanel.dev/discord"
          onClick={() =>
            trackFunnel('onboarding_support_link_clicked', {
              projectId: project.id,
              target: 'discord',
            })
          }
          rel="noreferrer"
          target="_blank"
        >
          Discord
        </a>
        . We answer quickly.
      </li>
    </ol>
  );
}
